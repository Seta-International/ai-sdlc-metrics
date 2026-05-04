import { uuid, text, date, timestamp, jsonb } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'
import { peopleSchema } from './people.schema'

export const profileChangeRequest = peopleSchema.table('profile_change_request', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  employmentId: uuid('employment_id').notNull(),
  batchId: uuid('batch_id'),
  reason: text('reason'),
  fieldPath: text('field_path').notNull(),
  oldValue: jsonb('old_value'),
  newValue: jsonb('new_value').notNull(),
  effectiveDate: date('effective_date', { mode: 'date' }),
  status: text('status', {
    enum: ['pending', 'approved', 'rejected', 'superseded', 'scheduled', 'applied'],
  }).notNull(),
  requestedBy: uuid('requested_by').notNull(),
  reviewedBy: uuid('reviewed_by'),
  reviewedAt: timestamp('reviewed_at'),
  reviewNote: text('review_note'),
  decisionCaseId: uuid('decision_case_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
