import { tenantUser } from '@seta/db'
import { sql } from 'drizzle-orm'
import {
  index,
  inet,
  pgPolicy,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

export const authSchema = pgSchema('auth')

export const users = authSchema.table('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  pictureUrl: text('picture_url'),
  primaryProvider: text('primary_provider', { enum: ['entra', 'google'] }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const userIdentities = authSchema.table(
  'user_identities',
  {
    provider: text('provider', { enum: ['entra', 'google'] }).notNull(),
    subject: text('subject').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.subject] }),
    index('user_identities_user_idx').on(t.userId),
  ],
)

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

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type UserIdentity = typeof userIdentities.$inferSelect
export type NewUserIdentity = typeof userIdentities.$inferInsert
export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert
