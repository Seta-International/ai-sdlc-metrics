import { boolean, jsonb, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { authSchema } from './users'

export const mailerConfigs = authSchema.table(
  'mailer_configs',
  {
    tenantId: uuid('tenant_id').notNull(),
    provider: text('provider').notNull(),
    config: jsonb('config').$type<Record<string, unknown>>().notNull(),
    secretVaultId: text('secret_vault_id'),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.provider] })],
)

export type MailerConfigRow = typeof mailerConfigs.$inferSelect
export type NewMailerConfigRow = typeof mailerConfigs.$inferInsert
