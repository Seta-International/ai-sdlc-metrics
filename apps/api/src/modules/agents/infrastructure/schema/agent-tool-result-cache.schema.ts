/**
 * agent_tool_result_cache — Drizzle schema for Plan 14 Semantic Result Cache.
 *
 * Each row is one cached tool invocation result, keyed by (tenant_id, tool_name,
 * canonical_args_hash) for exact lookups and indexed by (tenant_id, tool_name)
 * for fetching semantic-nearest-neighbor candidates in the application layer.
 *
 * semantic_embedding is nullable: a put() can succeed without an embedding when
 * the embedding provider is down (exact-only mode). Rows with a stale
 * embedding_model are ignored during semantic lookup (R-14.10).
 */

import { uuid, text, timestamp, jsonb, integer, index } from 'drizzle-orm/pg-core'
import { agentsSchema } from './agents.schema'

export const agentToolResultCache = agentsSchema.table(
  'agent_tool_result_cache',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** RLS partition key — every table has tenant_id, no exceptions. */
    tenantId: uuid('tenant_id').notNull(),
    /** Fully-qualified agent tool name, e.g. "people.getMe". */
    toolName: text('tool_name').notNull(),
    /** SHA-256 hex from plan 01's canonicalizer. */
    canonicalArgsHash: text('canonical_args_hash').notNull(),
    /**
     * Embedding vector of canonical args from `text-embedding-3-small`.
     * Stored as JSONB at MVP (no pgvector). Nullable: put() can succeed
     * without an embedding when the provider is unavailable (exact-only mode).
     */
    semanticEmbedding: jsonb('semantic_embedding').$type<number[] | null>(),
    /**
     * Model used to generate the embedding (e.g. 'text-embedding-3-small').
     * Rows with a stale model are skipped during semantic lookup (R-14.10).
     */
    embeddingModel: text('embedding_model').notNull(),
    /** Pre-rendered tool result (already redacted/wrapped). */
    result: jsonb('result').notNull(),
    storedAt: timestamp('stored_at', { withTimezone: true }).notNull().defaultNow(),
    /** TTL copied from tool meta at put time. */
    ttlSeconds: integer('ttl_seconds').notNull(),
  },
  (t) => [
    /**
     * B-tree index for exact-match cache lookups:
     *   SELECT * FROM agent_tool_result_cache
     *   WHERE tenant_id = $1 AND tool_name = $2 AND canonical_args_hash = $3
     */
    index('agent_tool_result_cache_exact_idx').on(t.tenantId, t.toolName, t.canonicalArgsHash),
    /**
     * Index for fetching candidate rows for semantic nearest-neighbor comparison
     * in the application layer (no pgvector at MVP — cosine similarity runs in TS).
     */
    index('agent_tool_result_cache_tenant_tool_idx').on(t.tenantId, t.toolName),
  ],
)

export type AgentToolResultCacheRow = typeof agentToolResultCache.$inferSelect
export type NewAgentToolResultCacheRow = typeof agentToolResultCache.$inferInsert
