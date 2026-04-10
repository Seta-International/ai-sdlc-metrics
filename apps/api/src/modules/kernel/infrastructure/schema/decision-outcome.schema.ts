import { coreSchema } from './actor.schema'
import { uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const decisionOutcome = coreSchema.table('decision_outcome', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  caseId: uuid('case_id').notNull(),
  finalAction: text('final_action', { enum: ['approved', 'rejected'] }).notNull(),
  decidedBy: uuid('decided_by').notNull(),
  decidedAt: timestamp('decided_at').defaultNow().notNull(),
})
