import { customType, inet, timestamp, uuid } from 'drizzle-orm/pg-core'
import { authSchema } from './users'

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
})

export const magicLinks = authSchema.table('magic_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  tenantId: uuid('tenant_id').notNull(),
  tokenHash: bytea('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  requestedIp: inet('requested_ip'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type MagicLinkRow = typeof magicLinks.$inferSelect
export type NewMagicLinkRow = typeof magicLinks.$inferInsert
