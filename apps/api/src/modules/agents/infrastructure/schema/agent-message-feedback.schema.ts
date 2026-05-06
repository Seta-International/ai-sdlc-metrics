import { primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { agentsSchema } from './agents.schema'

export const agentMessageFeedback = agentsSchema.table(
  'agent_message_feedback',
  {
    tenantId: uuid('tenant_id').notNull(),
    messageId: uuid('message_id').notNull(),
    actorId: uuid('actor_id').notNull(),
    rating: text('rating').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.messageId, t.actorId] })],
)
