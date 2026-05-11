import {
  customType,
  jsonb,
  pgSchema,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType() {
    return 'bytea'
  },
})

export const oauthSchema = pgSchema('oauth')

export const oauthTokens = oauthSchema.table(
  'oauth_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    providerId: text('provider_id').notNull(),
    partitionKey: text('partition_key').notNull(),
    scopeSet: jsonb('scope_set').$type<string[]>().notNull(),
    envelopeVersion: smallint('envelope_version').notNull().default(1),
    kmsKeyId: text('kms_key_id').notNull(),
    wrappedDek: bytea('wrapped_dek').notNull(),
    iv: bytea('iv').notNull(),
    authTag: bytea('auth_tag').notNull(),
    ciphertext: bytea('ciphertext').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('oauth_tokens_unique').on(t.tenantId, t.providerId, t.partitionKey)],
)

export const oauthState = oauthSchema.table('oauth_state', {
  state: text('state').primaryKey(),
  providerId: text('provider_id').notNull(),
  connectorIds: text('connector_ids').array().notNull(),
  nonce: text('nonce').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})

export type OAuthToken = typeof oauthTokens.$inferSelect
export type NewOAuthToken = typeof oauthTokens.$inferInsert
export type OAuthStateRow = typeof oauthState.$inferSelect
export type NewOAuthState = typeof oauthState.$inferInsert
