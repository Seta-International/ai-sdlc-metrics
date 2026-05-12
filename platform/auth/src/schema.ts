import { pgSchema, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const auth = pgSchema('auth')

/** Canonical Seta user identity — one row per person per tenant. */
export const users = auth.table(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    externalProvider: text('external_provider'),
    externalSubject: text('external_subject'),
    email: text('email').notNull(),
    displayName: text('display_name'),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('users_tenant_email_unique').on(t.tenantId, t.email),
    uniqueIndex('users_external_unique').on(t.externalProvider, t.externalSubject),
  ],
)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

export const sessions = auth.table('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  userId: uuid('user_id').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const apiKeys = auth.table('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  hashedKey: text('hashed_key').notNull(),
  scopes: text('scopes').array().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
})
