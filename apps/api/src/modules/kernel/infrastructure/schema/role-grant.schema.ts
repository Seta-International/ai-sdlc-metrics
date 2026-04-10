import { coreSchema } from './actor.schema'
import { uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const roleGrant = coreSchema.table('role_grant', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  actorId: uuid('actor_id').notNull(),
  roleKey: text('role_key', {
    enum: [
      'hr_ops',
      'line_manager',
      'staffing_owner',
      'account_manager',
      'finance_operator',
      'executive',
      'employee',
      'review_operator',
      'recruiter',
      'tenant_admin',
      'platform_admin',
    ],
  }).notNull(),
  scopeType: text('scope_type', {
    enum: ['global', 'department', 'project', 'account'],
  }).notNull(),
  scopeId: uuid('scope_id'),
  grantedBy: uuid('granted_by').notNull(),
  validFrom: timestamp('valid_from').defaultNow().notNull(),
  validUntil: timestamp('valid_until'),
})
