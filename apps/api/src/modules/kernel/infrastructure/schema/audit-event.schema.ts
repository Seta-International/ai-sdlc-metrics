import { coreSchema } from './actor.schema'
import { uuid, text, varchar, timestamp, jsonb, index } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

// INSERT-ONLY. No UPDATE or DELETE ever.
export const auditEvent = coreSchema.table(
  'audit_event',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    actorId: uuid('actor_id').notNull(),
    eventType: text('event_type').notNull(),
    module: text('module').notNull(),
    subjectId: text('subject_id').notNull(),
    payload: jsonb('payload').notNull(),
    /**
     * Plan 07 §3 — Correlates an audit event to a multi-step async flow
     * (e.g. an agent planning loop). NULL for single-step synchronous events.
     */
    flowId: uuid('flow_id'),
    /**
     * Plan 07 §3 — Human-readable slug identifying the intent that triggered
     * this event (e.g. 'approve-draft', 'schedule-fire', 'tool-invocation').
     * Used for structured querying and dashboard filtering. Max 120 chars.
     */
    intentSlug: varchar('intent_slug', { length: 120 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('audit_event_flow_id_idx').on(t.flowId),
    index('audit_event_intent_slug_idx').on(t.intentSlug),
  ],
)
