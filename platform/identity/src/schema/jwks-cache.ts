import { jsonb, text, timestamp } from 'drizzle-orm/pg-core'
import { authSchema } from './users.js'

export const jwksCache = authSchema.table('jwks_cache', {
  key: text('key').primaryKey(),
  payload: jsonb('payload').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})

export type JwksCache = typeof jwksCache.$inferSelect
