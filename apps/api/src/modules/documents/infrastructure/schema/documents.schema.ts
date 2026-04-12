import { pgSchema, uuid, text, integer, timestamp, boolean, jsonb } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const documentsSchema = pgSchema('documents')

export const template = documentsSchema.table('template', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  format: text('format', { enum: ['pdf', 'excel'] }).notNull(),
  content: text('content').notNull(),
  version: integer('version').notNull().default(1),
  isDefault: boolean('is_default').notNull().default(false),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const tenantBranding = documentsSchema.table('tenant_branding', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull().unique(),
  companyName: text('company_name').notNull(),
  logoFileKey: text('logo_file_key'),
  primaryColor: text('primary_color'),
  fontFamily: text('font_family'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const generationJob = documentsSchema.table('generation_job', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  templateId: uuid('template_id').notNull(),
  requestedBy: uuid('requested_by').notNull(),
  status: text('status', { enum: ['pending', 'processing', 'completed', 'failed'] })
    .notNull()
    .default('pending'),
  inputData: jsonb('input_data').notNull(),
  outputFileKey: text('output_file_key'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
})
