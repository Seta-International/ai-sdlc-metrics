import { boolean, jsonb, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { authSchema } from './users'

export const ssoConfigs = authSchema.table(
  'sso_configs',
  {
    tenantId: uuid('tenant_id').notNull(),
    provider: text('provider').notNull(),
    config: jsonb('config').$type<Record<string, unknown>>().notNull(),
    secretVaultId: text('secret_vault_id'),
    enabled: boolean('enabled').notNull().default(true),
    createdByUserId: uuid('created_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.provider] })],
)

export type SsoConfigRow = typeof ssoConfigs.$inferSelect
export type NewSsoConfigRow = typeof ssoConfigs.$inferInsert
