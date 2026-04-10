import { coreSchema } from './actor.schema.js'
import { uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const exposureContract = coreSchema.table('exposure_contract', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  toolName: text('tool_name').notNull(), // e.g. 'people_get_employment_profile'
  scopeId: uuid('scope_id').notNull(),
  allowedRoles: text('allowed_roles').array().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
