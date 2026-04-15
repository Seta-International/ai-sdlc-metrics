import { uuid, text, timestamp, boolean, integer, jsonb, uniqueIndex } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'
import { peopleSchema } from './people.schema'

export const countryFieldConfig = peopleSchema.table(
  'country_field_config',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    countryCode: text('country_code').notNull(),
    fieldKey: text('field_key').notNull(),
    label: text('label').notNull(),
    labelLocale: jsonb('label_locale'),
    fieldType: text('field_type', {
      enum: ['text', 'number', 'date', 'boolean', 'select'],
    }).notNull(),
    fieldGroup: text('field_group', {
      enum: ['identity', 'tax', 'social_insurance', 'vehicle', 'other'],
    }).notNull(),
    isRequired: boolean('is_required').notNull(),
    sortOrder: integer('sort_order').notNull(),
    validation: jsonb('validation'),
    options: jsonb('options'),
  },
  (table) => [
    uniqueIndex('country_field_config_country_key_uidx').on(
      table.tenantId,
      table.countryCode,
      table.fieldKey,
    ),
  ],
)

export const customFieldDefinition = peopleSchema.table(
  'custom_field_definition',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    fieldKey: text('field_key').notNull(),
    label: text('label').notNull(),
    fieldType: text('field_type', {
      enum: ['text', 'number', 'date', 'boolean', 'select', 'multi_select'],
    }).notNull(),
    fieldGroup: text('field_group'),
    isRequired: boolean('is_required').notNull(),
    isSearchable: boolean('is_searchable').notNull(),
    isFilterable: boolean('is_filterable').notNull(),
    sortOrder: integer('sort_order').notNull(),
    validation: jsonb('validation'),
    options: jsonb('options'),
    visibilityTier: text('visibility_tier', {
      enum: ['public', 'restricted', 'confidential'],
    }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('custom_field_definition_tenant_key_uidx').on(table.tenantId, table.fieldKey),
  ],
)

export const fieldVisibilityConfig = peopleSchema.table(
  'field_visibility_config',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    fieldPath: text('field_path').notNull(),
    visibilityTier: text('visibility_tier', {
      enum: ['public', 'restricted', 'confidential'],
    }).notNull(),
  },
  (table) => [
    uniqueIndex('field_visibility_config_tenant_path_uidx').on(table.tenantId, table.fieldPath),
  ],
)

export const fieldEditPolicy = peopleSchema.table(
  'field_edit_policy',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    fieldPath: text('field_path').notNull(),
    editMode: text('edit_mode', {
      enum: ['self_service', 'manager_approval', 'hr_approval', 'hr_only'],
    }).notNull(),
  },
  (table) => [
    uniqueIndex('field_edit_policy_tenant_path_uidx').on(table.tenantId, table.fieldPath),
  ],
)
