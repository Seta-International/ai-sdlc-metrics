import { coreSchema } from './actor.schema.js'
import { uuid, timestamp } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const orgPlacement = coreSchema.table('org_placement', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  actorId: uuid('actor_id').notNull(),
  departmentId: uuid('department_id').notNull(),
  managerId: uuid('manager_id'),
  effectiveFrom: timestamp('effective_from').notNull(),
  effectiveUntil: timestamp('effective_until'), // NULL = current placement
})
