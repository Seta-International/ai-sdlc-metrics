import { index, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { authSchema, users } from './users'

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

export type UserIdentity = typeof userIdentities.$inferSelect
export type NewUserIdentity = typeof userIdentities.$inferInsert
