import { pgSchema, uuid, text, timestamp, boolean, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'

export const identitySchema = pgSchema('identity')

export const identityProvider = identitySchema.table(
  'identity_provider',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    providerType: text('provider_type', {
      enum: ['microsoft', 'google'],
    }).notNull(),
    displayName: text('display_name').notNull(),
    clientId: text('client_id').notNull(),
    clientSecretRef: text('client_secret_ref').notNull(),
    directoryId: text('directory_id'),
    isPrimary: boolean('is_primary').notNull().default(false),
    syncEnabled: boolean('sync_enabled').notNull().default(false),
    lastSyncAt: timestamp('last_sync_at'),
    syncStatus: text('sync_status', {
      enum: ['idle', 'running', 'failed'],
    })
      .notNull()
      .default('idle'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_identity_provider_tenant_primary')
      .on(table.tenantId, table.isPrimary)
      .where(sql`${table.isPrimary} = true`),
  ],
)

export const idpGroupMapping = identitySchema.table(
  'idp_group_mapping',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    identityProviderId: uuid('identity_provider_id').notNull(),
    externalGroupId: text('external_group_id').notNull(),
    externalGroupName: text('external_group_name').notNull(),
    roleKey: text('role_key').notNull(),
    scopeType: text('scope_type', {
      enum: ['global', 'department', 'project', 'account'],
    }).notNull(),
    scopeId: uuid('scope_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_idp_group_mapping_role_scope').on(
      table.tenantId,
      table.externalGroupId,
      table.roleKey,
      table.scopeType,
      table.scopeId,
    ),
  ],
)

export const magicLinkToken = identitySchema.table(
  'magic_link_token',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    usedAt: timestamp('used_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_magic_link_token_hash_unused')
      .on(table.tokenHash)
      .where(sql`${table.usedAt} IS NULL`),
  ],
)

export const apiKey = identitySchema.table('api_key', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  actorId: uuid('actor_id').notNull(),
  keyHash: text('key_hash').notNull(),
  keyLastFour: text('key_last_four').notNull(),
  name: text('name').notNull(),
  lastUsedAt: timestamp('last_used_at'),
  expiresAt: timestamp('expires_at'),
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
