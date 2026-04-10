import { coreSchema } from './actor.schema.js'
import { uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

// INSERT-ONLY. No UPDATE or DELETE ever.
export const auditEvent = coreSchema.table('audit_event', {
  id:        uuid('id').$defaultFn(() => uuidv7()).primaryKey(),
  tenantId:  uuid('tenant_id').notNull(),
  actorId:   uuid('actor_id').notNull(),
  eventType: text('event_type').notNull(),
  module:    text('module').notNull(),
  subjectId: uuid('subject_id').notNull(),
  payload:   jsonb('payload').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
