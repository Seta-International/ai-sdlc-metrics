import { coreSchema } from './actor.schema'
import { uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const decisionCase = coreSchema.table('decision_case', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  module: text('module').notNull(),
  subjectId: uuid('subject_id').notNull(),
  requestedBy: uuid('requested_by').notNull(),
  status: text('status', { enum: ['pending', 'approved', 'rejected', 'cancelled'] })
    .notNull()
    .default('pending'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
