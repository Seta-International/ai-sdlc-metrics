import { coreSchema } from './actor.schema'
import { uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const delegation = coreSchema.table('delegation', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  delegatorId: uuid('delegator_id').notNull(),
  delegateeId: uuid('delegatee_id').notNull(),
  role: text('role').notNull(),
  validFrom: timestamp('valid_from').notNull(),
  validUntil: timestamp('valid_until').notNull(),
})
