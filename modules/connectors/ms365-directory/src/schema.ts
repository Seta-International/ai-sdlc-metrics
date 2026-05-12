import { jsonb, pgSchema, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const connectorMs365Directory = pgSchema('connector_ms365_directory')

export const directoryUsers = connectorMs365Directory.table(
  'directory_users',
  {
    tenantId: uuid('tenant_id').notNull(),
    entraObjectId: text('entra_object_id').notNull(),
    userPrincipalName: text('user_principal_name'),
    mail: text('mail'),
    displayName: text('display_name'),
    managerId: text('manager_id'),
    raw: jsonb('raw').$type<Record<string, unknown>>().default({}).notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.entraObjectId] })],
)

export const directoryGroups = connectorMs365Directory.table(
  'directory_groups',
  {
    tenantId: uuid('tenant_id').notNull(),
    entraGroupId: text('entra_group_id').notNull(),
    displayName: text('display_name'),
    groupType: text('group_type'),
    raw: jsonb('raw').$type<Record<string, unknown>>().default({}).notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.entraGroupId] })],
)

export const directoryGroupMembers = connectorMs365Directory.table(
  'directory_group_members',
  {
    tenantId: uuid('tenant_id').notNull(),
    entraGroupId: text('entra_group_id').notNull(),
    entraObjectId: text('entra_object_id').notNull(),
    role: text('role').notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.entraGroupId, t.entraObjectId] })],
)

export const syncState = connectorMs365Directory.table(
  'sync_state',
  {
    tenantId: uuid('tenant_id').notNull(),
    resourceKind: text('resource_kind').notNull(),
    deltaToken: text('delta_token'),
    lastFullSyncAt: timestamp('last_full_sync_at', { withTimezone: true }),
    lastDeltaSyncAt: timestamp('last_delta_sync_at', { withTimezone: true }),
    status: text('status').notNull().default('idle'),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.resourceKind] })],
)

export type DirectoryUser = typeof directoryUsers.$inferSelect
export type DirectoryGroup = typeof directoryGroups.$inferSelect
export type DirectoryGroupMember = typeof directoryGroupMembers.$inferSelect
