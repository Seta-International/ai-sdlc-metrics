import { coreSchema } from './actor.schema'
import { uuid, text, integer, timestamp } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const decisionStep = coreSchema.table('decision_step', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  caseId: uuid('case_id').notNull(),
  stepOrder: integer('step_order').notNull(),
  approverId: uuid('approver_id').notNull(),
  status: text('status', { enum: ['pending', 'approved', 'rejected'] })
    .notNull()
    .default('pending'),
  decidedAt: timestamp('decided_at'),
})
