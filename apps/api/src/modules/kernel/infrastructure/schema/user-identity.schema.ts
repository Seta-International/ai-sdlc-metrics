import { coreSchema } from './actor.schema.js'
import { uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const userIdentity = coreSchema.table('user_identity', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  actorId: uuid('actor_id').notNull(), // soft ref to actor.id
  ssoSubject: text('sso_subject').notNull(), // Entra OID
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
