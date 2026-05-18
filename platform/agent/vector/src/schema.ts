import { tenantUser } from '@seta/db'
import { sql } from 'drizzle-orm'
import {
  char,
  integer,
  pgPolicy,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core'

// drizzle-kit resolves schema.ts via CJS; @seta/agent-core exposes only ESM
// exports so the transitive require() fails. Mirror the constant here to keep
// drizzle-kit generation self-contained. Value must stay in sync with
// @seta/agent-embeddings EMBEDDING_DIMENSIONS (currently 1536).
const EMBEDDING_DIMENSIONS = 1536 as const

export const agentVectorSchema = pgSchema('agent_vector')

export const chunks = agentVectorSchema.table(
  'chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    sourceId: uuid('source_id').notNull(),
    content: text('content').notNull(),
    contentHash: char('content_hash', { length: 64 }).notNull(),
    tokenCount: integer('token_count').notNull(),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('chunks_tenant_source_hash_unique').on(t.tenantId, t.sourceId, t.contentHash),
    pgPolicy('tenant_isolation_chunks', {
      as: 'permissive',
      to: tenantUser,
      for: 'all',
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
      withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ],
)

export type Chunk = typeof chunks.$inferSelect
export type NewChunk = typeof chunks.$inferInsert
