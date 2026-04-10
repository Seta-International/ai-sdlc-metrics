import { pgSchema, uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const coreSchema = pgSchema('core')

export const actor = coreSchema.table('actor', {
  id:          uuid('id').$defaultFn(() => uuidv7()).primaryKey(),
  tenantId:    uuid('tenant_id').notNull(),
  type:        text('type', { enum: ['person', 'organization', 'system'] }).notNull(),
  displayName: text('display_name').notNull(),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
})
