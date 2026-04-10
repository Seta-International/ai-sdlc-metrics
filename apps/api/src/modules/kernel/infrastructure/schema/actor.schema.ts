import { pgSchema, uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const coreSchema = pgSchema('core')

export const actor = coreSchema.table('actor', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  type: text('type', { enum: ['person', 'organization', 'system'] }).notNull(),
  displayName: text('display_name').notNull(),
  status: text('status', {
    enum: ['invited', 'active', 'inactive', 'suspended', 'archived'],
  })
    .notNull()
    .default('invited'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
