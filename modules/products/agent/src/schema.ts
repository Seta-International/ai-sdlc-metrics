import { index, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const agentSchema = pgSchema('agent')

export const writeContinuations = agentSchema.table(
  'write_continuations',
  {
    token: text('token').primaryKey(),
    uuid: text('uuid').notNull().unique(),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(),
    toolId: text('tool_id').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    etagSnapshot: jsonb('etag_snapshot').$type<Record<string, string>>().notNull(),
    resultCard: jsonb('result_card').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (t) => [index('write_continuations_active').on(t.tenantId, t.userId, t.expiresAt)],
)

export type WriteContinuationRow = typeof writeContinuations.$inferSelect
export type NewWriteContinuation = typeof writeContinuations.$inferInsert
