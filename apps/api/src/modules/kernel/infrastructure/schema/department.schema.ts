import { coreSchema } from './actor.schema'
import { uuid, text, timestamp, boolean } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const department = coreSchema.table('department', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  parentId: uuid('parent_id'), // soft ref to department.id
  costCenterCode: text('cost_center_code'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
