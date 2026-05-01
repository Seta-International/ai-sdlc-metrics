/**
 * ToolRetriever — per-invocation nearest-neighbour tool selector.
 *
 * Given a sub-agent directive (goal + constraints), computes a directive embedding
 * and ranks the tool scope by cosine similarity against pre-built tool descriptor
 * embeddings. Returns top-K tools, unioned with mandatory `coreTools` (which always
 * appear first in declaration order).
 *
 * Fallback contract: if the embedding provider is unreachable, the full `toolScope`
 * is returned with `fallbackFired: true`. The agent continues to function — unlike
 * the boot-time embedder, runtime retrieval gracefully degrades.
 *
 * OTel span: `tool-retrieval:retrieve` with tool retrieval attributes.
 */

import { createHash } from 'node:crypto'
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common'
import { embed } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { trace } from '@opentelemetry/api'
import type { AgentToolDescriptor } from '../../../../common/trpc/agent-tool-meta'
import type { SubAgentKey } from '../../domain/services/sub-agent-types'
import { ToolDescriptorEmbedder, TOOL_DESCRIPTOR_EMBEDDER } from './tool-descriptor-embedder'
import { cosineSimilarity } from './cosine'
import { RETRIEVAL_EMBEDDING_MODEL } from './retrieval-constants'

export const TOOL_RETRIEVER = Symbol('TOOL_RETRIEVER')

export interface RetrieveOpts {
  /** Branded sub-agent key for tracing. */
  readonly subAgentKey: SubAgentKey
  /** Directive describing the current session goal and constraints. */
  readonly directive: {
    readonly goal: string
    readonly constraints: readonly string[]
  }
  /** Already-resolved, role+module+screen filtered tool scope. */
  readonly toolScope: ReadonlyArray<AgentToolDescriptor>
  /** Tool names that are always included regardless of similarity. */
  readonly coreTools: ReadonlyArray<string>
  /** Number of top similar tools to retrieve (from toolRetrieval.topK, default 6). */
  readonly topK: number
}

export interface RetrieveResult {
  /** coreTools first (in declaration order), then ranked retrieved tools. */
  readonly selected: ReadonlyArray<AgentToolDescriptor>
  /** true iff the embedding provider was unreachable and the full scope was returned. */
  readonly fallbackFired: boolean
  /** SHA-256 hash of the canonicalized directive query. */
  readonly retrievalInputHash: string
}

/** Max cached directive embeddings. LRU via Map insertion-order eviction. */
const MAX_DIRECTIVE_CACHE = 500

@Injectable()
export class ToolRetriever implements OnModuleInit {
  private readonly logger = new Logger(ToolRetriever.name)
  private readonly tracer = trace.getTracer('agents')
  /** OpenAI client, initialised in onModuleInit after API key validation. */
  private openai!: ReturnType<typeof createOpenAI>
  /** Per-instance cache: retrievalInputHash → directive embedding vector. */
  private readonly _directiveCache = new Map<string, number[]>()

  constructor(
    @Inject(TOOL_DESCRIPTOR_EMBEDDER)
    private readonly embedder: ToolDescriptorEmbedder,
  ) {}

  onModuleInit(): void {
    if (process.env['LOCAL_DEV'] && !process.env['OPENAI_API_KEY']) return
    const apiKey = process.env['OPENAI_API_KEY']
    if (!apiKey || apiKey.trim() === '') {
      throw new Error(
        'ToolRetriever: OPENAI_API_KEY missing or empty. ' +
          'Set OPENAI_API_KEY in environment variables.',
      )
    }
    this.openai = createOpenAI({ apiKey })
  }

  async retrieve(opts: RetrieveOpts): Promise<RetrieveResult> {
    const startMs = Date.now()
    const span = this.tracer.startSpan('tool-retrieval:retrieve')

    try {
      const result = await this._retrieve(opts, startMs)

      span.setAttributes({
        'tool.retrieval.sub_agent_key': opts.subAgentKey,
        'tool.retrieval.topk_configured': opts.topK,
        'tool.retrieval.topk_resolved': result.selected.length,
        'tool.retrieval.tool_scope_size': opts.toolScope.length,
        'tool.retrieval.core_tools_size': opts.coreTools.length,
        'tool.retrieval.fallback_fired': result.fallbackFired,
        'tool.retrieval.input_hash': result.retrievalInputHash,
        'tool.retrieval.duration_ms': Date.now() - startMs,
      })

      return result
    } finally {
      span.end()
    }
  }

  private async _retrieve(opts: RetrieveOpts, startMs: number): Promise<RetrieveResult> {
    const { subAgentKey, directive, toolScope, coreTools, topK } = opts

    // Sort constraints so order doesn't affect the hash.
    // JSON.stringify avoids ambiguity between a long goal and separate constraints.
    const directiveText = JSON.stringify({
      goal: directive.goal,
      constraints: [...directive.constraints].sort(),
    })
    const retrievalInputHash = createHash('sha256').update(directiveText).digest('hex')

    let directiveEmbedding: number[]
    const cached = this._directiveCache.get(retrievalInputHash)
    if (cached !== undefined) {
      directiveEmbedding = cached
    } else {
      try {
        const { embedding } = await embed({
          model: this.openai.embedding(RETRIEVAL_EMBEDDING_MODEL),
          value: directiveText,
        })
        directiveEmbedding = embedding
        // Evict oldest entry if cap reached (Map preserves insertion order)
        if (this._directiveCache.size >= MAX_DIRECTIVE_CACHE) {
          const oldest = this._directiveCache.keys().next().value
          if (oldest !== undefined) this._directiveCache.delete(oldest)
        }
        this._directiveCache.set(retrievalInputHash, embedding)
      } catch (error) {
        // Fallback: return full toolScope on provider outage
        this.logger.warn(
          `ToolRetriever: embedding provider unreachable for subAgent=${subAgentKey}. ` +
            `Falling back to full toolScope (${toolScope.length} tools). Error: ${String(error)}`,
        )
        // DEFERRED: replace with metric counter agent_tool_retrieval_fallback_fired_total{cause}
        // once Plan 07 metrics infrastructure ships.
        this.logger.warn(
          `tool.retrieval.fallback_fired cause=${error instanceof Error && error.message.includes('timeout') ? 'provider_timeout' : 'provider_error'} sub_agent_key=${subAgentKey}`,
        )
        return {
          selected: toolScope,
          fallbackFired: true,
          retrievalInputHash,
        }
      }
    }

    // Tools without a vector in the embedder's index are skipped.
    const scored: Array<{ tool: AgentToolDescriptor; score: number }> = []
    for (const tool of toolScope) {
      const toolVec = this.embedder.getEmbedding(tool.name)
      if (toolVec === undefined) {
        // No vector for this tool — skip it (treat as similarity 0 / excluded)
        continue
      }
      scored.push({
        tool,
        score: cosineSimilarity(directiveEmbedding, toolVec),
      })
    }

    scored.sort((a, b) => b.score - a.score)
    const topKScored = scored.slice(0, topK)

    const scopeByName = new Map<string, AgentToolDescriptor>(toolScope.map((t) => [t.name, t]))

    const resolvedCoreTools: AgentToolDescriptor[] = []
    const coreToolNameSet = new Set<string>()
    for (const name of coreTools) {
      const descriptor = scopeByName.get(name)
      if (descriptor !== undefined) {
        resolvedCoreTools.push(descriptor)
        coreToolNameSet.add(name)
      }
    }

    // Union — coreTools first, then ranked (excluding coreTools).
    const selected: AgentToolDescriptor[] = [...resolvedCoreTools]
    const seenNames = new Set<string>(coreToolNameSet)

    for (const { tool } of topKScored) {
      if (!seenNames.has(tool.name)) {
        selected.push(tool)
        seenNames.add(tool.name)
      }
    }

    this.logger.debug(
      `ToolRetriever: subAgent=${subAgentKey} scope=${toolScope.length} ` +
        `coreTools=${resolvedCoreTools.length} topK=${topK} selected=${selected.length} ` +
        `durationMs=${Date.now() - startMs}`,
    )

    return {
      selected,
      fallbackFired: false,
      retrievalInputHash,
    }
  }
}
