/**
 * ToolDescriptorEmbedder — boot-time service that ensures every agent tool
 * descriptor has an up-to-date embedding vector in the `agent_tool_embedding`
 * table, then exposes an in-memory lookup map for retrieval.
 *
 * Boot-time pipeline (R-02.5.12):
 *   1. For each descriptor, compute a SHA-256 content_hash of its
 *      { whenToUse, whenNotToUse } fields using canonicalize().
 *   2. Query existing rows from DB by tool_name (sequential, per CLAUDE.md rule).
 *   3. For descriptors whose (tool_name, content_hash) pair is missing, call
 *      embedMany in a single batch to get all missing vectors.
 *   4. Insert each new row sequentially (one per missing descriptor).
 *   5. Return { embedded, reused } counts.
 *
 * Refusal contract (R-02.5.12):
 *   If the embedding provider is unreachable AND any descriptor lacks a DB row,
 *   throw — do NOT start in degraded mode. If all rows exist in DB, boot
 *   succeeds even if the provider is down.
 *
 * In-memory index:
 *   After ensureEmbedded(), call buildInMemoryIndex() to load the latest
 *   embedding per tool_name into a Map<string, number[]> for runtime retrieval.
 *   getEmbedding(toolName) returns the vector or undefined.
 */

import { createHash } from 'node:crypto'
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { inArray } from 'drizzle-orm'
import { embedMany } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import type { AgentToolDescriptor } from '../../../../common/trpc/agent-tool-meta'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type { Db } from '@future/db'
import { canonicalize } from '../cache/canonical-args'
import { agentToolEmbeddings } from '../schema/agent-tool-embedding.schema'
import { RETRIEVAL_EMBEDDING_MODEL } from './retrieval-constants'

export const TOOL_DESCRIPTOR_EMBEDDER = Symbol('TOOL_DESCRIPTOR_EMBEDDER')

export interface EnsureEmbeddedResult {
  /** Number of new (tool_name, content_hash) rows inserted this boot. */
  readonly embedded: number
  /** Number of descriptors whose hash already existed in the DB (no call made). */
  readonly reused: number
}

@Injectable()
export class ToolDescriptorEmbedder implements OnModuleInit {
  private readonly logger = new Logger(ToolDescriptorEmbedder.name)
  /** In-memory index: tool_name → latest embedding vector. */
  private readonly _index = new Map<string, number[]>()
  /** OpenAI client, initialised in onModuleInit after API key validation. */
  private openai!: ReturnType<typeof createOpenAI>

  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  onModuleInit(): void {
    // Validate OPENAI_API_KEY at module init so failures surface early.
    if (process.env['LOCAL_DEV'] && !process.env['OPENAI_API_KEY']) return
    const apiKey = process.env['OPENAI_API_KEY']
    if (!apiKey || apiKey.trim() === '') {
      throw new Error(
        'ToolDescriptorEmbedder: OPENAI_API_KEY missing or empty. ' +
          'Set OPENAI_API_KEY in environment variables.',
      )
    }
    this.openai = createOpenAI({ apiKey })
  }

  /**
   * Compute a deterministic SHA-256 content hash from the tool descriptor's
   * semantic fields. Key sort and datetime normalisation are handled by canonicalize().
   *
   * Input shape: { whenNotToUse, whenToUse }
   * (keys sorted alphabetically for stable serialisation)
   */
  private computeContentHash(descriptor: AgentToolDescriptor): string {
    const content = {
      whenNotToUse: descriptor.meta.whenNotToUse,
      whenToUse: descriptor.meta.whenToUse,
    }
    const { canonical } = canonicalize(content)
    return createHash('sha256').update(canonical).digest('hex')
  }

  /**
   * Main boot-time pipeline. Must be called after onModuleInit().
   *
   * DB queries are sequential (no Promise.all for DB) per CLAUDE.md rule.
   * The embedMany call is NOT a DB query — batch it in one shot for efficiency.
   *
   * @throws {Error} if the embedding provider is unreachable AND any descriptor
   *   has no existing DB row (R-02.5.12 boot-time refusal).
   */
  async ensureEmbedded(
    descriptors: ReadonlyArray<AgentToolDescriptor>,
  ): Promise<EnsureEmbeddedResult> {
    if (descriptors.length === 0) {
      return { embedded: 0, reused: 0 }
    }

    const hashMap = new Map<string, string>() // tool_name → content_hash
    for (const descriptor of descriptors) {
      hashMap.set(descriptor.name, this.computeContentHash(descriptor))
    }

    // Only fetch (tool_name, content_hash) — embedding blob not needed here.
    const allNames = descriptors.map((d) => d.name)
    const existingPairs = new Set<string>() // key: `${toolName}::${contentHash}`

    const dbRows = await this.db
      .select({
        toolName: agentToolEmbeddings.toolName,
        contentHash: agentToolEmbeddings.contentHash,
      })
      .from(agentToolEmbeddings)
      .where(inArray(agentToolEmbeddings.toolName, allNames))

    for (const row of dbRows) {
      existingPairs.add(`${row.toolName}::${row.contentHash}`)
    }

    const missing: AgentToolDescriptor[] = []
    for (const descriptor of descriptors) {
      const hash = hashMap.get(descriptor.name)!
      if (!existingPairs.has(`${descriptor.name}::${hash}`)) {
        missing.push(descriptor)
      }
    }

    const reused = descriptors.length - missing.length

    if (missing.length === 0) {
      this.logger.log(
        `ToolDescriptorEmbedder: all ${reused} tool embedding(s) reused from DB. No OpenAI call needed.`,
      )
      return { embedded: 0, reused }
    }

    // embedMany is NOT a DB query — Promise.all / batch call is fine here.
    // Text uses only the two fields that form the content_hash: whenToUse + whenNotToUse.
    const texts = missing.map((d) => {
      return `${d.meta.whenToUse} ${d.meta.whenNotToUse}`
    })

    // If no OpenAI client (LOCAL_DEV without API key), skip embedding — degraded
    // mode is allowed when the environment has explicitly opted out of AI features.
    if (!this.openai) {
      this.logger.warn(
        `ToolDescriptorEmbedder: OPENAI_API_KEY not set — skipping embedding for ` +
          `${missing.length} tool(s). Retrieval will be unavailable.`,
      )
      return { embedded: 0, reused }
    }

    let newEmbeddings: number[][]
    try {
      const { embeddings } = await embedMany({
        model: this.openai.embedding(RETRIEVAL_EMBEDDING_MODEL),
        values: texts,
      })
      newEmbeddings = embeddings
    } catch (err) {
      // If provider is unreachable AND some descriptors have no DB row,
      // throw — do NOT boot in degraded mode.
      throw new Error(
        `ToolDescriptorEmbedder: embedding provider unreachable at boot and ` +
          `${missing.length} tool(s) have no existing embedding in DB. ` +
          `Cannot start in degraded mode. Underlying error: ${String(err)}`,
      )
    }

    const newRows = missing.map((descriptor, i) => ({
      toolName: descriptor.name,
      contentHash: hashMap.get(descriptor.name)!,
      embedding: newEmbeddings[i]!,
      // descriptor_snapshot stores only the fields used in the content hash
      // so the snapshot is always consistent with what was embedded.
      descriptorSnapshot: {
        whenToUse: descriptor.meta.whenToUse,
        whenNotToUse: descriptor.meta.whenNotToUse,
      } as Record<string, unknown>,
    }))

    await this.db.insert(agentToolEmbeddings).values(newRows).onConflictDoNothing()

    // Emit one audit log per newly inserted row (audit loop, not a DB loop).
    // TODO plan 07: replace with KernelAuditFacade.emit('agent.tool_descriptor_embedded')
    for (const row of newRows) {
      this.logger.log(
        `audit:agent.tool_descriptor_embedded toolName=${row.toolName} contentHash=${row.contentHash}`,
      )
    }

    const embedded = missing.length

    this.logger.log(
      `ToolDescriptorEmbedder: ${embedded} new embedding(s) generated, ${reused} reused from DB.`,
    )

    return { embedded, reused }
  }

  /**
   * Loads the latest-hash embedding per tool_name from DB into the in-memory
   * Map. Call this after ensureEmbedded() completes.
   *
   * DB queries are sequential (no Promise.all for DB) per CLAUDE.md rule.
   */
  async buildInMemoryIndex(descriptors: ReadonlyArray<AgentToolDescriptor>): Promise<void> {
    this._index.clear()

    if (descriptors.length === 0) {
      this.logger.debug('ToolDescriptorEmbedder: in-memory index built with 0 tool(s).')
      return
    }

    // Build hash map and fetch all relevant rows in one batch SELECT.
    const hashByName = new Map(descriptors.map((d) => [d.name, this.computeContentHash(d)]))
    const allNames = Array.from(hashByName.keys())

    const rows = await this.db
      .select({
        toolName: agentToolEmbeddings.toolName,
        contentHash: agentToolEmbeddings.contentHash,
        embedding: agentToolEmbeddings.embedding,
      })
      .from(agentToolEmbeddings)
      .where(inArray(agentToolEmbeddings.toolName, allNames))

    for (const row of rows) {
      const expectedHash = hashByName.get(row.toolName)
      if (expectedHash !== undefined && row.contentHash === expectedHash) {
        this._index.set(row.toolName, row.embedding)
      }
    }

    this.logger.debug(
      `ToolDescriptorEmbedder: in-memory index built with ${this._index.size} tool(s).`,
    )
  }

  /**
   * Returns the latest embedding vector for the given tool_name, or `undefined`
   * if the tool is not in the in-memory index.
   *
   * Must be called after buildInMemoryIndex() has been awaited.
   */
  getEmbedding(toolName: string): number[] | undefined {
    return this._index.get(toolName)
  }
}
