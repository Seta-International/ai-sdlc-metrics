import { coreSchema } from './actor.schema'
import { uuid, text, timestamp, jsonb, boolean } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const outboxEvent = coreSchema.table('outbox_event', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  eventName: text('event_name').notNull(),
  payload: jsonb('payload').notNull(),
  published: boolean('published').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  publishedAt: timestamp('published_at'),
})
