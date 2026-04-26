/**
 * SemanticResultCache — Plan 14 Semantic Result Cache service.
 *
 * Two-tier lookup:
 *   1. Exact key (tenant_id, tool_name, canonical_args_hash) → CacheHit 'exact'
 *   2. Semantic nearest-neighbor using cosine similarity on embedding vectors → CacheHit 'semantic'
 *
 * Fail-open (R-14.8): DB errors and embedding provider errors never throw to callers.
 * Rows with a different embedding_model are ignored (R-14.10).
 */

import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { embed } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { eq, and, isNotNull, like, sql } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { canonicalize } from './canonical-args'
import { cosineSimilarity } from '../retrieval/cosine'
import { agentToolResultCache } from '../schema/agent-tool-result-cache.schema'

// ─── DI token ─────────────────────────────────────────────────────────────────

export const SEMANTIC_RESULT_CACHE = Symbol('SEMANTIC_RESULT_CACHE')

// ─── Public interfaces ────────────────────────────────────────────────────────

export interface CacheHit {
  result: unknown
  hitKind: 'exact' | 'semantic'
  storedAt: Date
}

export interface SemanticCacheGetInput {
  tenantId: string
  toolName: string
  args: unknown
  /** Current embedding model (R-14.10: skip rows with different model). */
  embeddingModel: string
  /** 0–1, cosine similarity threshold for semantic match. */
  distanceThreshold: number
}

export interface SemanticCachePutInput {
  tenantId: string
  toolName: string
  args: unknown
  result: unknown
  ttlSeconds: number
  embeddingModel: string
}

export interface SemanticCacheInvalidateDomainInput {
  tenantId: string
  /** First dot-segment of tool name, e.g. "projects". */
  domain: string
}

// ─── SemanticResultCache ──────────────────────────────────────────────────────

@Injectable()
export class SemanticResultCache implements OnModuleInit {
  private readonly logger = new Logger(SemanticResultCache.name)
  /** OpenAI client initialised in onModuleInit(). */
  private openai: ReturnType<typeof createOpenAI> | undefined

  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  onModuleInit(): void {
    // Skip key validation in LOCAL_DEV without a key — degraded mode allowed.
    if (process.env['LOCAL_DEV'] && !process.env['OPENAI_API_KEY']) return
    const apiKey = process.env['OPENAI_API_KEY']
    if (!apiKey || apiKey.trim() === '') {
      throw new Error(
        'SemanticResultCache: OPENAI_API_KEY missing or empty. ' +
          'Set OPENAI_API_KEY in environment variables.',
      )
    }
    this.openai = createOpenAI({ apiKey })
  }

  // ─── get() ────────────────────────────────────────────────────────────────

  /**
   * R-14.4: Try exact key first before computing any embedding.
   * R-14.8: Fail-open — any DB or embedding error returns undefined.
   * R-14.10: Only consider rows whose embedding_model matches input.
   */
  async get(input: SemanticCacheGetInput): Promise<CacheHit | undefined> {
    const { tenantId, toolName, args, embeddingModel, distanceThreshold } = input

    try {
      // ── Step 1: Canonicalize args ─────────────────────────────────────────
      const { canonical, hash } = canonicalize(args)

      // ── Step 2: Exact-key lookup (R-14.4) ────────────────────────────────
      const notExpiredFilter = sql`${agentToolResultCache.storedAt} + ${agentToolResultCache.ttlSeconds} * interval '1 second' > NOW()`

      const exactRows = await this.db
        .select()
        .from(agentToolResultCache)
        .where(
          and(
            eq(agentToolResultCache.tenantId, tenantId),
            eq(agentToolResultCache.toolName, toolName),
            eq(agentToolResultCache.canonicalArgsHash, hash),
            notExpiredFilter,
          ),
        )

      if (exactRows.length > 0) {
        const row = exactRows[0]!
        return {
          result: row.result,
          hitKind: 'exact',
          storedAt: row.storedAt,
        }
      }

      // ── Step 3: Compute embedding for semantic lookup ─────────────────────
      if (!this.openai) {
        // No embedding provider — skip semantic lookup
        return undefined
      }

      let queryEmbedding: number[]
      try {
        const { embedding } = await embed({
          model: this.openai.embedding(embeddingModel),
          value: canonical,
        })
        queryEmbedding = embedding
      } catch (embeddingErr) {
        this.logger.warn(
          `SemanticResultCache.get: embedding provider failed — skipping semantic lookup. ` +
            `Error: ${String(embeddingErr)}`,
        )
        return undefined
      }

      // ── Step 4: Fetch candidates (same tenant, tool, model, not expired) ──
      const candidateRows = await this.db
        .select()
        .from(agentToolResultCache)
        .where(
          and(
            eq(agentToolResultCache.tenantId, tenantId),
            eq(agentToolResultCache.toolName, toolName),
            isNotNull(agentToolResultCache.semanticEmbedding),
            eq(agentToolResultCache.embeddingModel, embeddingModel),
            notExpiredFilter,
          ),
        )

      // ── Step 5: Find nearest neighbour ────────────────────────────────────
      let bestScore = -Infinity
      let bestRow: (typeof candidateRows)[number] | undefined

      for (const row of candidateRows) {
        if (!row.semanticEmbedding) continue
        const score = cosineSimilarity(queryEmbedding, row.semanticEmbedding)
        if (score > bestScore) {
          bestScore = score
          bestRow = row
        }
      }

      if (bestRow !== undefined && bestScore >= distanceThreshold) {
        return {
          result: bestRow.result,
          hitKind: 'semantic',
          storedAt: bestRow.storedAt,
        }
      }

      return undefined
    } catch (err) {
      this.logger.error(
        `SemanticResultCache.get: DB error — returning undefined (fail-open). ` +
          `Error: ${String(err)}`,
      )
      return undefined
    }
  }

  // ─── put() ────────────────────────────────────────────────────────────────

  /**
   * Store a pre-rendered tool result (R-14.9).
   * Fire-and-forget: errors are logged, never thrown.
   * If embedding fails, row is stored without embedding (exact-only fallback).
   */
  async put(input: SemanticCachePutInput): Promise<void> {
    const { tenantId, toolName, args, result, ttlSeconds, embeddingModel } = input

    try {
      // ── Step 1: Canonicalize args ─────────────────────────────────────────
      const { canonical, hash } = canonicalize(args)

      // ── Step 2: Try to compute embedding ─────────────────────────────────
      let semanticEmbedding: number[] | null = null

      if (this.openai) {
        try {
          const { embedding } = await embed({
            model: this.openai.embedding(embeddingModel),
            value: canonical,
          })
          semanticEmbedding = embedding
        } catch (embeddingErr) {
          this.logger.warn(
            `SemanticResultCache.put: embedding provider failed — storing without embedding. ` +
              `Error: ${String(embeddingErr)}`,
          )
          // semanticEmbedding stays null → exact-only fallback
        }
      }

      // ── Step 3: Insert row (onConflictDoNothing handles concurrent puts) ──
      await this.db
        .insert(agentToolResultCache)
        .values({
          tenantId,
          toolName,
          canonicalArgsHash: hash,
          semanticEmbedding,
          embeddingModel,
          result: result as Record<string, unknown>,
          ttlSeconds,
        })
        .onConflictDoNothing()
    } catch (err) {
      this.logger.error(
        `SemanticResultCache.put: error storing cache entry — non-fatal. ` +
          `Error: ${String(err)}`,
      )
    }
  }

  // ─── invalidateDomain() ───────────────────────────────────────────────────

  /**
   * Delete all cache rows for a domain (first dot-segment of tool_name).
   * E.g. domain="projects" deletes "projects.getTasks", "projects.getById", etc.
   */
  async invalidateDomain(
    input: SemanticCacheInvalidateDomainInput,
  ): Promise<{ purgedCount: number }> {
    const { tenantId, domain } = input

    try {
      const deleteResult = await this.db
        .delete(agentToolResultCache)
        .where(
          and(
            eq(agentToolResultCache.tenantId, tenantId),
            like(agentToolResultCache.toolName, `${domain}.%`),
          ),
        )

      // Drizzle returns { rowCount: number } for delete operations
      const purgedCount = (deleteResult as unknown as { rowCount?: number }).rowCount ?? 0

      this.logger.log(
        `SemanticResultCache.invalidateDomain: purged ${purgedCount} row(s) for domain "${domain}" (tenant: ${tenantId})`,
      )

      return { purgedCount }
    } catch (err) {
      this.logger.error(
        `SemanticResultCache.invalidateDomain: DB error — returning purgedCount: 0. ` +
          `Error: ${String(err)}`,
      )
      return { purgedCount: 0 }
    }
  }
}
