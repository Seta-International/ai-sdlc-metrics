import { coreSchema } from './actor.schema'
import { uuid, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const userIdentity = coreSchema.table(
  'user_identity',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    actorId: uuid('actor_id').notNull(), // soft ref to actor.id
    email: text('email').notNull(),
    ssoSubject: text('sso_subject').notNull(), // Microsoft Entra OID
    provider: text('provider', { enum: ['microsoft', 'google', 'local'] }).notNull(),
    status: text('status', { enum: ['active', 'suspended', 'deprovisioned'] })
      .notNull()
      .default('active'),
    lastLoginAt: timestamp('last_login_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_user_identity_tenant_sso_subject').on(table.tenantId, table.ssoSubject),
  ],
)
