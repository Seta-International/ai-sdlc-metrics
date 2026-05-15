import { pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core'

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

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
