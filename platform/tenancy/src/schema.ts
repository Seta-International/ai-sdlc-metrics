import { jsonb, pgSchema, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

export const tenantSchema = pgSchema('tenant')

export const tenants = tenantSchema.table('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  displayName: text('display_name'),
  status: text('status').notNull().default('active'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const tenantConnectors = tenantSchema.table(
  'tenant_connectors',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    connectorId: text('connector_id').notNull(),
    status: text('status').notNull().default('pending_consent'),
    consentedAt: timestamp('consented_at', { withTimezone: true }),
    consentedByUserId: uuid('consented_by_user_id'),
    scopeSet: jsonb('scope_set').$type<{ delegated: string[]; application: string[] }>(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.connectorId] })],
)

export const tenantMemberRole = tenantSchema.enum('tenant_member_role', [
  'owner',
  'admin',
  'member',
])

export const tenantMembers = tenantSchema.table(
  'tenant_members',
  {
    userId: uuid('user_id').notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    role: tenantMemberRole('role').notNull().default('member'),
    source: text('source').notNull().default('manual'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.tenantId] }),
    unique('tenant_members_user_unique').on(t.userId),
  ],
)

export type Tenant = typeof tenants.$inferSelect
export type NewTenant = typeof tenants.$inferInsert
export type TenantConnector = typeof tenantConnectors.$inferSelect
export type NewTenantConnector = typeof tenantConnectors.$inferInsert
export type TenantMember = typeof tenantMembers.$inferSelect
export type NewTenantMember = typeof tenantMembers.$inferInsert
