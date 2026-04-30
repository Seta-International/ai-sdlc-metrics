/**
 * agent_semantic_index — Drizzle schema for Plan 04 semantic recall index.
 *
 * Plan 04 requires per-tenant isolation for the semantic recall index.
 * This implementation follows Option A: a single shared table with tenant_id +
 * RLS, consistent with every other table in this module. The "per-tenant
 * physical table" phrasing in Plan 04 §3 was aspirational — RLS-enforced
 * tenant isolation is structurally equivalent and avoids the complexity of
 * dynamic table creation per tenant onboarding.
 *
 * Embedding storage: JSONB number[] (no pgvector at MVP). pgvector is not
 * provisioned on the base postgres:18 image used in development. Cosine
 * similarity for semantic search runs in the application layer (same approach
 * as agent_tool_embedding and agent_tool_result_cache). HNSW/IVFFlat indexes
 * will be added when pgvector is provisioned on all environments.
 *
 * GDPR path: purgeForUser() deletes by (tenant_id, user_id). The userId column
 * is stored directly for O(1) GDPR erasure without requiring a provenance join
 * through agent_message.id.
 */

import { uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core'
import { agentsSchema } from './agents.schema'

/**
 * Stores per-turn semantic recall embeddings, keyed by (tenant_id, user_id,
 * sub_agent_id) with provenance back to the originating agent_message.id.
 *
 * Writes come exclusively from the post-turn `index-turn-semantic` pg-boss job
 * (fire-and-forget, never inline on saveMessages). Reads come
 * exclusively from sub-agents that have opted into semantic recall as a tool
 * call — never pre-injected at router level.
 */
export const agentSemanticIndex = agentsSchema.table(
  'agent_semantic_index',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** RLS partition key — every table has tenant_id, no exceptions. */
    tenantId: uuid('tenant_id').notNull(),
    /** Owner of the recalled content. Required for GDPR purgeForUser. */
    userId: uuid('user_id').notNull(),
    /**
     * Which sub-agent this recall entry is for (sub-agent opted into semantic recall).
     * Nullable: NULL means the entry applies across all sub-agents for the user.
     */
    subAgentId: text('sub_agent_id'),
    /**
     * Provenance back to the originating source (e.g. agent_message.id).
     * Used for audit joins and deterministic GDPR erasure walk.
     */
    sourceId: uuid('source_id').notNull(),
    /**
     * Type of source document (e.g. 'agent_message', 'scratchpad').
     */
    sourceType: text('source_type').notNull(),
    /**
     * The original text chunk that was embedded (for debugging / audit).
     * Never included in search result payloads to avoid taint surfacing.
     */
    chunkText: text('chunk_text').notNull(),
    /**
     * 1536-dimensional float vector from `text-embedding-3-small`.
     * Stored as JSONB at MVP (no pgvector). Use $type<number[]>() so Drizzle
     * treats the column as a typed number array at the TypeScript layer.
     */
    embedding: jsonb('embedding').$type<number[]>().notNull(),
    /**
     * Model used to generate the embedding (e.g. 'text-embedding-3-small').
     * Rows with stale model strings are skipped during semantic search.
     */
    embeddingModel: text('embedding_model').notNull(),
    /**
     * GDPR / archive retention policy (e.g. '90d', 'session', 'permanent').
     * Consumed by the nightly retention sweep job.
     */
    retentionPolicy: text('retention_policy').notNull().default('90d'),
    /** Per-row metadata (arbitrary JSONB for per-source annotations). */
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /**
     * B-tree index for GDPR purgeForUser O(1) scan:
     *   DELETE FROM agent_semantic_index WHERE tenant_id = $1 AND user_id = $2
     */
    index('agent_semantic_index_tenant_user_idx').on(t.tenantId, t.userId),
    /**
     * B-tree index for sub-agent-scoped semantic recall fetch candidates:
     *   SELECT … WHERE tenant_id = $1 AND user_id = $2 AND sub_agent_id = $3
     */
    index('agent_semantic_index_tenant_user_subagent_idx').on(t.tenantId, t.userId, t.subAgentId),
    /**
     * B-tree on source_id for provenance-walk lookups (audit + GDPR walk via message).
     */
    index('agent_semantic_index_source_idx').on(t.tenantId, t.sourceId),
  ],
)

export type AgentSemanticIndexRow = typeof agentSemanticIndex.$inferSelect
export type NewAgentSemanticIndexRow = typeof agentSemanticIndex.$inferInsert
