import { coreSchema } from './actor.schema.js'
import { uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const roleGrant = coreSchema.table('role_grant', {
  id:        uuid('id').$defaultFn(() => uuidv7()).primaryKey(),
  tenantId:  uuid('tenant_id').notNull(),
  actorId:   uuid('actor_id').notNull(),
  role:      text('role').notNull(),
  scope:     text('scope', { enum: ['global', 'department', 'project', 'account'] }).notNull(),
  scopeId:   uuid('scope_id'),
  grantedAt: timestamp('granted_at').defaultNow().notNull(),
})
