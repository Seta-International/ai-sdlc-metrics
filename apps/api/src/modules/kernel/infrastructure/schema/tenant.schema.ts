import { text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'
import { coreSchema } from './actor.schema'

export const tenant = coreSchema.table('tenant', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  status: text('status', { enum: ['active', 'suspended', 'cancelled'] })
    .notNull()
    .default('active'),
  planTier: text('plan_tier', { enum: ['starter', 'professional', 'enterprise'] }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
