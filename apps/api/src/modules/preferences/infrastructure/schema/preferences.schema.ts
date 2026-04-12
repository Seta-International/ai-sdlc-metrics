import { pgSchema, uuid, text, boolean, jsonb, timestamp, index, unique } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'
import { sql } from 'drizzle-orm'

const preferencesSchema = pgSchema('preferences')

export const savedView = preferencesSchema.table(
  'saved_view',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    actorId: uuid('actor_id').notNull(),
    resourceKey: text('resource_key').notNull(),
    name: text('name').notNull(),
    isDefault: boolean('is_default').default(false).notNull(),
    stateJson: jsonb('state_json').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('saved_view_tenant_actor_resource_idx').on(
      table.tenantId,
      table.actorId,
      table.resourceKey,
    ),
    // Partial unique index: only one default per (tenant, actor, resource)
    // Using a raw SQL index since drizzle-kit supports it via sql tag
    index('saved_view_unique_default_idx')
      .on(table.tenantId, table.actorId, table.resourceKey)
      .where(sql`is_default = true`),
  ],
)

export type SavedViewRow = typeof savedView.$inferSelect
export type NewSavedViewRow = typeof savedView.$inferInsert
