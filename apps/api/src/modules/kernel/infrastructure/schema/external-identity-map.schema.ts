import { coreSchema } from './actor.schema.js'
import { uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const externalIdentityMap = coreSchema.table('external_identity_map', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  actorId: uuid('actor_id').notNull(),
  systemName: text('system_name').notNull(), // 'ems' | 'timesheet' | 'slack' | 'teams'
  externalId: text('external_id').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
