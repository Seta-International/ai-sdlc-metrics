import { tenantUser } from '@seta/db'
import { sql } from 'drizzle-orm'
import { index, inet, pgPolicy, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { authSchema, users } from './users'

export const sessions = authSchema.table(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('sessions_user_idx').on(t.userId),
    index('sessions_expires_idx').on(t.expiresAt),
    pgPolicy('session_owner_isolation', {
      as: 'permissive',
      to: tenantUser,
      for: 'all',
      using: sql`${t.userId} = current_setting('app.user_id', true)::uuid`,
      withCheck: sql`${t.userId} = current_setting('app.user_id', true)::uuid`,
    }),
  ],
)

export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert
