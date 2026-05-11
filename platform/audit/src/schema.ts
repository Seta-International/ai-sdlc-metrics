import { bigserial, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const auditSchema = pgSchema('audit')

export const auditLog = auditSchema.table('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  actorType: text('actor_type').notNull(),
  actorId: text('actor_id').notNull(),
  providerId: text('provider_id'),
  connectorId: text('connector_id'),
  operation: text('operation').notNull(),
  resourceType: text('resource_type'),
  resourceIds: text('resource_ids').array(),
  result: text('result').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
  ts: timestamp('ts', { withTimezone: true }).defaultNow().notNull(),
})

export type AuditLogRow = typeof auditLog.$inferSelect
export type NewAuditLog = typeof auditLog.$inferInsert
