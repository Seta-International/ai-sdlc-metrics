/**
 * DrizzleSemanticIndexRepository — Drizzle ORM implementation of SemanticIndexRepository.
 *
 * Plan 04. Single `agent_semantic_index` table with tenant_id + RLS
 * (Option A — equivalent isolation to per-tenant physical tables; simpler; consistent
 * with every other table in this module).
 *
 * Embedding storage: JSONB number[] (no pgvector at MVP). Cosine similarity for
 * semantic search runs in the application layer via cosineSimilarity(). HNSW/IVFFlat
 * indexes will be added when pgvector is provisioned.
 *
 * GDPR path: purgeForUser() hard-deletes by (tenant_id, user_id) and returns the
 * real count. userId is stored directly on the row for O(1) erasure without
 * requiring a provenance join.
 *
 * No Promise.all over DB queries — single PoolClient per request (CLAUDE.md).
 */

import { Inject, Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { cosineSimilarity } from '../retrieval/cosine'
import { agentSemanticIndex } from '../schema/agent-semantic-index.schema'
import type {
  SemanticIndexRepository,
  SemanticIndexResult,
} from '../../domain/repositories/semantic-index.repository'

@Injectable()
export class DrizzleSemanticIndexRepository implements SemanticIndexRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  /**
   * Upsert a semantic recall entry for a user.
   *
   * Called from the post-turn `index-turn-semantic` pg-boss job — never inline
   * on saveMessages (fire-and-forget).
   *
   * ON CONFLICT DO NOTHING on (tenant_id, source_id): if the same source is
   * re-indexed (e.g. job retry), we skip — the first write wins.
   */
  async index(opts: {
    tenantId: string
    userId: string
    subAgentId?: string | null
    sourceId: string
    sourceType: string
    text: string
    embedding: number[]
    embeddingModel: string
    retentionPolicy?: string
    metadata?: Record<string, unknown>
  }): Promise<void> {
    await this.db
      .insert(agentSemanticIndex)
      .values({
        tenantId: opts.tenantId,
        userId: opts.userId,
        subAgentId: opts.subAgentId ?? null,
        sourceId: opts.sourceId,
        sourceType: opts.sourceType,
        chunkText: opts.text,
        embedding: opts.embedding,
        embeddingModel: opts.embeddingModel,
        retentionPolicy: opts.retentionPolicy ?? '90d',
        metadata: opts.metadata ?? null,
        createdAt: new Date(),
      })
      .onConflictDoNothing()
  }

  /**
   * Top-k semantic similarity search using application-layer cosine similarity.
   *
   * RLS enforces tenant isolation at the DB layer. We fetch all rows for the
   * tenant (filtered by user) and rank by cosine similarity in the application
   * layer. At MVP candidate set sizes are small enough for this to be acceptable.
   *
   * When pgvector is provisioned this should be replaced with a native
   * `embedding <=> queryVec ORDER BY ... LIMIT topK` query.
   */
  async search(opts: {
    tenantId: string
    userId: string
    queryEmbedding: number[]
    embeddingModel: string
    topK: number
    subAgentId?: string | null
  }): Promise<ReadonlyArray<SemanticIndexResult>> {
    // Fetch candidate rows for this (tenant, user). RLS enforces tenant isolation.
    const rows = await this.db
      .select({
        sourceId: agentSemanticIndex.sourceId,
        sourceType: agentSemanticIndex.sourceType,
        embedding: agentSemanticIndex.embedding,
        embeddingModel: agentSemanticIndex.embeddingModel,
      })
      .from(agentSemanticIndex)
      .where(
        and(
          eq(agentSemanticIndex.tenantId, opts.tenantId),
          eq(agentSemanticIndex.userId, opts.userId),
        ),
      )

    // Filter to matching embedding model (stale models are skipped).
    const candidates = rows.filter((r) => r.embeddingModel === opts.embeddingModel)

    // Compute cosine similarity and rank.
    const scored = candidates.map((r) => ({
      sourceId: r.sourceId,
      sourceType: r.sourceType,
      score: cosineSimilarity(r.embedding ?? [], opts.queryEmbedding),
    }))

    // Sort descending by score, take topK.
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, opts.topK)
  }

  /**
   * GDPR erasure: hard-delete all semantic index entries for a user.
   *
   * Returns the real count of deleted rows so the GDPRErasurePipeline can
   * report accurate semanticIndexPurged counts.
   */
  async purgeForUser(opts: { tenantId: string; userId: string }): Promise<{ count: number }> {
    const rows = await this.db
      .delete(agentSemanticIndex)
      .where(
        and(
          eq(agentSemanticIndex.tenantId, opts.tenantId),
          eq(agentSemanticIndex.userId, opts.userId),
        ),
      )
      .returning({ id: agentSemanticIndex.id })

    return { count: rows.length }
  }
}
