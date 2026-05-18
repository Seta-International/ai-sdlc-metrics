import { text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { authSchema } from './users'

export const ssoEmailDomains = authSchema.table('sso_email_domains', {
  domain: text('domain').primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type SsoEmailDomainRow = typeof ssoEmailDomains.$inferSelect
export type NewSsoEmailDomainRow = typeof ssoEmailDomains.$inferInsert
