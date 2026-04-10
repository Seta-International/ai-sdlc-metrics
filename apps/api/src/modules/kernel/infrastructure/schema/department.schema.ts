import { coreSchema } from './actor.schema.js'
import { uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const department = coreSchema.table('department', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  parentId: uuid('parent_id'), // soft ref to department.id
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
