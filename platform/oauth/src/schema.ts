import { tenantUser } from '@seta/db'
import { sql } from 'drizzle-orm'
import {
  customType,
  jsonb,
  pgPolicy,
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
  (t) => [
    uniqueIndex('oauth_tokens_unique').on(t.tenantId, t.providerId, t.partitionKey),
    // RLS — drizzle-kit emits ENABLE + CREATE POLICY for this declaration.
    // FORCE ROW LEVEL SECURITY and the tenant_user GRANT are appended by hand
    // in 0001_security_hardening.sql (drizzle 0.45.2 doesn't model those).
    pgPolicy('tenant_isolation_oauth_tokens', {
      as: 'permissive',
      to: tenantUser,
      for: 'all',
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
      withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ],
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
