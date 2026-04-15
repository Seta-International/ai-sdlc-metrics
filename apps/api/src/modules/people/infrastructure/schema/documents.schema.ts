import { uuid, text, date, timestamp, boolean, integer } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'
import { peopleSchema } from './people.schema'

export const employeeDocument = peopleSchema.table('employee_document', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  employmentId: uuid('employment_id').notNull(),
  documentId: uuid('document_id').notNull(),
  category: text('category', {
    enum: [
      'identity',
      'contract',
      'tax',
      'insurance',
      'certificate',
      'visa',
      'policy_ack',
      'health_check',
      'background_check',
      'other',
    ],
  }).notNull(),
  subcategory: text('subcategory'),
  title: text('title').notNull(),
  expiryDate: date('expiry_date', { mode: 'date' }),
  isConfidential: boolean('is_confidential').notNull(),
  requiresAcknowledgment: boolean('requires_acknowledgment').notNull(),
  acknowledgedAt: timestamp('acknowledged_at'),
  acknowledgedBy: uuid('acknowledged_by'),
  version: integer('version').notNull(),
  parentDocumentId: uuid('parent_document_id'),
  status: text('status', { enum: ['active', 'archived', 'pending_deletion'] }).notNull(),
  uploadedBy: uuid('uploaded_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const documentRequirement = peopleSchema.table('document_requirement', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  countryCode: text('country_code').notNull(),
  employmentType: text('employment_type'),
  category: text('category').notNull(),
  title: text('title').notNull(),
  isRequired: boolean('is_required').notNull(),
  deadlineDays: integer('deadline_days'),
  sortOrder: integer('sort_order').notNull(),
})

export const completenessRule = peopleSchema.table('completeness_rule', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  fieldPath: text('field_path').notNull(),
  weight: integer('weight').notNull(),
  isRequired: boolean('is_required').notNull(),
  countryCode: text('country_code'),
  employmentType: text('employment_type'),
  deadlineDays: integer('deadline_days'),
  label: text('label').notNull(),
  section: text('section').notNull(),
  sortOrder: integer('sort_order').notNull(),
})
