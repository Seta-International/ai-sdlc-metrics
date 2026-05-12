import { jsonb, pgSchema, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const directorySchema = pgSchema('directory')

export const externalIdentities = directorySchema.table(
  'external_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(),
    providerId: text('provider_id').notNull(),
    externalSubject: text('external_subject').notNull(),
    rawProfile: jsonb('raw_profile').$type<Record<string, unknown>>().default({}).notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('ext_identity_unique').on(t.providerId, t.externalSubject)],
)

export type ExternalIdentity = typeof externalIdentities.$inferSelect
export type NewExternalIdentity = typeof externalIdentities.$inferInsert
