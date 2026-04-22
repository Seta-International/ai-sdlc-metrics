/**
 * agent_tool_embedding — Drizzle schema for boot-time tool descriptor embeddings.
 *
 * Plan 02.5 §3 — Tenant-neutral exception:
 *   This table stores OpenAI `text-embedding-3-small` vectors for agent tool
 *   descriptors. Embeddings are keyed by (tool_name, content_hash) and are
 *   identical across all tenants — the embedding captures the tool's
 *   `whenToUse`/`whenNotToUse` text which is platform-authored, not
 *   tenant-authored. Adding `tenant_id` would create per-tenant duplicates of
 *   identical vectors without adding any security boundary. RLS is therefore
 *   intentionally omitted here.
 *
 *   This is a documented exception to the "every table has tenant_id" rule
 *   (CLAUDE.md §Hard Rules → Infrastructure). The exception is approved in
 *   plan 02.5 §3.
 */

import { text, timestamp, jsonb, index, primaryKey } from 'drizzle-orm/pg-core'
import { agentsSchema } from './agents.schema'

/**
 * Stores the embedding vector for each (tool_name, content_hash) pair.
 *
 * Composite primary key on (tool_name, content_hash) ensures:
 *   - One row per content version of each tool.
 *   - Inserting with the same (tool_name, content_hash) is idempotent (ON CONFLICT DO NOTHING).
 *   - Old content_hash rows are retained for audit — cleanup is deferred to a future migration.
 *
 * embedding: stored as JSONB `number[]` — avoids the pgvector dependency at MVP.
 *   pgvector will be added in a later plan once the extension is provisioned on all
 *   environments. The column type accepts number arrays natively through Drizzle's
 *   $type<number[]>() override.
 *
 * descriptor_snapshot: full AgentToolDescriptor at embedding time, for audit.
 *   Allows verifying embedding correctness after registry changes.
 */
export const agentToolEmbeddings = agentsSchema.table(
  'agent_tool_embedding',
  {
    toolName: text('tool_name').notNull(),
    contentHash: text('content_hash').notNull(),
    /**
     * 1536-dimensional float vector from `text-embedding-3-small`.
     * Stored as JSONB at MVP (no pgvector). Use $type<number[]>() to
     * make Drizzle treat the column as a typed number array at the TS layer.
     */
    embedding: jsonb('embedding').$type<number[]>().notNull(),
    /**
     * Full AgentToolDescriptor JSON snapshot at the time the embedding was
     * generated. Retained for audit and drift detection.
     */
    descriptorSnapshot: jsonb('descriptor_snapshot').$type<Record<string, unknown>>().notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.toolName, t.contentHash] }),
    /**
     * Index on tool_name alone for fast "latest hash" lookups during boot:
     *   SELECT content_hash FROM agent_tool_embedding WHERE tool_name = $1
     * This is the primary read pattern used by ToolDescriptorEmbedder.ensureEmbedded().
     */
    index('agent_tool_embedding_tool_name_idx').on(t.toolName),
  ],
)

export type AgentToolEmbeddingRow = typeof agentToolEmbeddings.$inferSelect
export type NewAgentToolEmbeddingRow = typeof agentToolEmbeddings.$inferInsert
