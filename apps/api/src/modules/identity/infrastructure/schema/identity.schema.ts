import {
  pgSchema,
  uuid,
  text,
  timestamp,
  boolean,
  uniqueIndex,
  index,
  integer,
  primaryKey,
} from 'drizzle-orm/pg-core'
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
    uniqueIndex('uq_idp_group_mapping_role_scope_scoped')
      .on(table.tenantId, table.externalGroupId, table.roleKey, table.scopeType, table.scopeId)
      .where(sql`${table.scopeId} IS NOT NULL`),
    uniqueIndex('uq_idp_group_mapping_role_scope_global')
      .on(table.tenantId, table.externalGroupId, table.roleKey, table.scopeType)
      .where(sql`${table.scopeId} IS NULL`),
  ],
)

export const msGraphCredential = identitySchema.table('ms_graph_credential', {
  tenantId: uuid('tenant_id').primaryKey().notNull(),
  clientId: text('client_id').notNull(),
  clientSecretRef: text('client_secret_ref').notNull(),
  tenantAdId: text('tenant_ad_id').notNull(),
  scopes: text('scopes').array().notNull(),
  status: text('status').notNull().default('active'),
  consentedAt: timestamp('consented_at', { withTimezone: true }).notNull(),
  lastValidatedAt: timestamp('last_validated_at', { withTimezone: true }),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const idpGroupMember = identitySchema.table(
  'idp_group_member',
  {
    tenantId: uuid('tenant_id').notNull(),
    externalGroupId: text('external_group_id').notNull(),
    ssoSubject: text('sso_subject').notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.externalGroupId, table.ssoSubject] }),
    index('idx_idp_group_member_lookup').on(table.tenantId, table.externalGroupId),
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

export const syncHistory = identitySchema.table(
  'sync_history',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    identityProviderId: uuid('identity_provider_id').notNull(),
    status: text('status', { enum: ['completed', 'failed'] }).notNull(),
    usersCreated: integer('users_created').notNull().default(0),
    usersDeactivated: integer('users_deactivated').notNull().default(0),
    rolesChanged: integer('roles_changed').notNull().default(0),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at').notNull(),
    completedAt: timestamp('completed_at').notNull(),
  },
  (table) => [index('idx_sync_history_tenant_started').on(table.tenantId, table.startedAt)],
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

export const tenantDomain = identitySchema.table(
  'tenant_domain',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    domain: text('domain').notNull(),
    status: text('status', { enum: ['pending', 'verified', 'disabled'] })
      .notNull()
      .default('pending'),
    verificationTokenHash: text('verification_token_hash').notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('tenant_domain_domain_uidx').on(table.domain)],
)

export const oauthAuthorizationSession = identitySchema.table(
  'oauth_authorization_session',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    providerId: uuid('provider_id').notNull(),
    providerType: text('provider_type', { enum: ['microsoft', 'google'] }).notNull(),
    stateHash: text('state_hash').notNull(),
    nonceHash: text('nonce_hash').notNull(),
    callbackUri: text('callback_uri').notNull(),
    redirectTo: text('redirect_to').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('oauth_authorization_session_state_uidx').on(table.stateHash),
    index('oauth_authorization_session_tenant_idx').on(table.tenantId, table.createdAt),
  ],
)
