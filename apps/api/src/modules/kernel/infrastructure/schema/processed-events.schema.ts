import { coreSchema } from './actor.schema'
import { uuid, timestamp } from 'drizzle-orm/pg-core'

// Idempotency log for outbox event relay
export const processedEvents = coreSchema.table('processed_events', {
  eventId: uuid('event_id').primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  processedAt: timestamp('processed_at').defaultNow().notNull(),
})
