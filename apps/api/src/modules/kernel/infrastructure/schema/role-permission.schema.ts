import { coreSchema } from './actor.schema'
import { uuid, text, timestamp, boolean, uniqueIndex } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const rolePermission = coreSchema.table(
  'role_permission',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    roleKey: text('role_key', {
      enum: [
        'hr_ops',
        'line_manager',
        'project_manager',
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
    permissionKey: text('permission_key').notNull(),
    isLocked: boolean('is_locked').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    tenantRolePermissionUnique: uniqueIndex('uq_role_permission_tenant_role_perm').on(
      table.tenantId,
      table.roleKey,
      table.permissionKey,
    ),
  }),
)
