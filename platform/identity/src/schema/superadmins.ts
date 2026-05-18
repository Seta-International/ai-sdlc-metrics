import { timestamp, uuid } from 'drizzle-orm/pg-core'
import { authSchema, users } from './users'

export const superadmins = authSchema.table('superadmins', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
  grantedBy: uuid('granted_by').references(() => users.id, { onDelete: 'set null' }),
})

export type Superadmin = typeof superadmins.$inferSelect
export type NewSuperadmin = typeof superadmins.$inferInsert
