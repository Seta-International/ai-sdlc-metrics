# People Module — Plan 03: Multi-Country & Extensibility

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement country-configurable field validation, tenant custom fields, field-level visibility tiers, and field edit policies. This plan makes the people module multi-country from day one and gives tenants self-service extensibility without code changes.

**Architecture:** Hexagonal + DDD + CQRS. Configuration entities are reference data (country_field_config, custom_field_definition). Validation services live in application/services/ with zero infrastructure deps. Visibility filtering is applied at query handler level, not DB-level RLS.

**Tech Stack:** NestJS, Drizzle ORM, PostgreSQL 16, tRPC, Zod, Vitest

**Spec Reference:** `docs/superpowers/specs/2026-04-15-people-module-redesign.md` — Sections 4 (Country Config), 5 (Access Control), 9 (Custom Fields)

**Depends on:** Plan 01 (Foundation & Core Schema)

---

## File Structure

### Files to CREATE

```
# Domain entities
apps/api/src/modules/people/domain/entities/country-field-config.entity.ts
apps/api/src/modules/people/domain/entities/custom-field-definition.entity.ts
apps/api/src/modules/people/domain/entities/field-visibility-config.entity.ts
apps/api/src/modules/people/domain/entities/field-edit-policy.entity.ts

# Domain repositories
apps/api/src/modules/people/domain/repositories/country-field-config.repository.ts
apps/api/src/modules/people/domain/repositories/custom-field-definition.repository.ts
apps/api/src/modules/people/domain/repositories/field-visibility-config.repository.ts
apps/api/src/modules/people/domain/repositories/field-edit-policy.repository.ts

# Value objects
apps/api/src/modules/people/domain/value-objects/visibility-tier.ts

# Infrastructure — schema
apps/api/src/modules/people/infrastructure/schema/extensibility.schema.ts

# Infrastructure — repositories
apps/api/src/modules/people/infrastructure/repositories/drizzle-country-field-config.repository.ts
apps/api/src/modules/people/infrastructure/repositories/drizzle-custom-field-definition.repository.ts
apps/api/src/modules/people/infrastructure/repositories/drizzle-field-visibility-config.repository.ts
apps/api/src/modules/people/infrastructure/repositories/drizzle-field-edit-policy.repository.ts

# Application — services
apps/api/src/modules/people/application/services/country-field-validation.service.ts
apps/api/src/modules/people/application/services/country-field-validation.service.spec.ts
apps/api/src/modules/people/application/services/custom-field-validation.service.ts
apps/api/src/modules/people/application/services/custom-field-validation.service.spec.ts
apps/api/src/modules/people/application/services/field-visibility-filter.service.ts
apps/api/src/modules/people/application/services/field-visibility-filter.service.spec.ts
apps/api/src/modules/people/application/services/edit-policy.service.ts
apps/api/src/modules/people/application/services/edit-policy.service.spec.ts

# Application — commands
apps/api/src/modules/people/application/commands/create-custom-field-definition.command.ts
apps/api/src/modules/people/application/commands/create-custom-field-definition.handler.ts
apps/api/src/modules/people/application/commands/create-custom-field-definition.handler.spec.ts
apps/api/src/modules/people/application/commands/update-custom-field-definition.command.ts
apps/api/src/modules/people/application/commands/update-custom-field-definition.handler.ts
apps/api/src/modules/people/application/commands/update-custom-field-definition.handler.spec.ts

# Infrastructure — seed
apps/api/src/modules/people/infrastructure/seed/vietnam-country-fields.seed.ts
apps/api/src/modules/people/infrastructure/seed/singapore-country-fields.seed.ts
apps/api/src/modules/people/infrastructure/seed/default-visibility.seed.ts
apps/api/src/modules/people/infrastructure/seed/default-edit-policy.seed.ts

# Tests (co-located — listed above)
```

---

## Task 1: Country Field Config Schema + Entity + Repository + Drizzle Repo

**Files:**

- Create: entity, repository, schema, Drizzle repo

- [ ] **Step 1: Create the entity**

```typescript
// apps/api/src/modules/people/domain/entities/country-field-config.entity.ts

export interface CountryFieldConfig {
  id: string
  countryCode: string
  fieldKey: string
  label: string
  labelLocale: Record<string, string> | null
  fieldType: 'text' | 'number' | 'date' | 'boolean' | 'select'
  fieldGroup: 'identity' | 'tax' | 'social_insurance' | 'vehicle' | 'other'
  isRequired: boolean
  sortOrder: number
  validation: CountryFieldValidation | null
  options: CountryFieldOption[] | null
}

export interface CountryFieldValidation {
  regex?: string
  minLength?: number
  maxLength?: number
  format?: string
}

export interface CountryFieldOption {
  value: string
  label: string
}
```

- [ ] **Step 2: Create repository interface**

```typescript
// apps/api/src/modules/people/domain/repositories/country-field-config.repository.ts

import type { CountryFieldConfig } from '../entities/country-field-config.entity'

export const COUNTRY_FIELD_CONFIG_REPOSITORY = Symbol('ICountryFieldConfigRepository')

export interface ICountryFieldConfigRepository {
  findById(id: string): Promise<CountryFieldConfig | null>
  findByCountryCode(countryCode: string): Promise<CountryFieldConfig[]>
  findByCountryAndKey(countryCode: string, fieldKey: string): Promise<CountryFieldConfig | null>
  insertMany(data: Omit<CountryFieldConfig, 'id'>[]): Promise<CountryFieldConfig[]>
  update(
    id: string,
    data: Partial<Omit<CountryFieldConfig, 'id' | 'countryCode' | 'fieldKey'>>,
  ): Promise<CountryFieldConfig>
}
```

- [ ] **Step 3: Add to Drizzle schema**

```typescript
// apps/api/src/modules/people/infrastructure/schema/extensibility.schema.ts

import {
  pgSchema,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'
import { peopleSchema } from './people.schema'

export const countryFieldConfig = peopleSchema.table(
  'country_field_config',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
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
  (table) => [uniqueIndex('uq_country_field_config_key').on(table.countryCode, table.fieldKey)],
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
  (table) => [uniqueIndex('uq_custom_field_definition_key').on(table.tenantId, table.fieldKey)],
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
  (table) => [uniqueIndex('uq_field_visibility_config_path').on(table.tenantId, table.fieldPath)],
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
  (table) => [uniqueIndex('uq_field_edit_policy_path').on(table.tenantId, table.fieldPath)],
)
```

- [ ] **Step 4: Implement Drizzle repo**

```typescript
// apps/api/src/modules/people/infrastructure/repositories/drizzle-country-field-config.repository.ts

import { Inject, Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { DB_TOKEN, type Db } from '@future/db'
import type { CountryFieldConfig } from '../../domain/entities/country-field-config.entity'
import type { ICountryFieldConfigRepository } from '../../domain/repositories/country-field-config.repository'
import { countryFieldConfig } from '../schema/extensibility.schema'

@Injectable()
export class DrizzleCountryFieldConfigRepository implements ICountryFieldConfigRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string): Promise<CountryFieldConfig | null> {
    const rows = await this.db
      .select()
      .from(countryFieldConfig)
      .where(eq(countryFieldConfig.id, id))
      .limit(1)
    return (rows[0] as CountryFieldConfig | undefined) ?? null
  }

  async findByCountryCode(countryCode: string): Promise<CountryFieldConfig[]> {
    return (await this.db
      .select()
      .from(countryFieldConfig)
      .where(eq(countryFieldConfig.countryCode, countryCode))
      .orderBy(countryFieldConfig.sortOrder)) as CountryFieldConfig[]
  }

  async findByCountryAndKey(
    countryCode: string,
    fieldKey: string,
  ): Promise<CountryFieldConfig | null> {
    const rows = await this.db
      .select()
      .from(countryFieldConfig)
      .where(
        and(
          eq(countryFieldConfig.countryCode, countryCode),
          eq(countryFieldConfig.fieldKey, fieldKey),
        ),
      )
      .limit(1)
    return (rows[0] as CountryFieldConfig | undefined) ?? null
  }

  async insertMany(data: Omit<CountryFieldConfig, 'id'>[]): Promise<CountryFieldConfig[]> {
    return (await this.db
      .insert(countryFieldConfig)
      .values(data as Record<string, unknown>[])
      .returning()) as CountryFieldConfig[]
  }

  async update(
    id: string,
    data: Partial<Omit<CountryFieldConfig, 'id' | 'countryCode' | 'fieldKey'>>,
  ): Promise<CountryFieldConfig> {
    const rows = await this.db
      .update(countryFieldConfig)
      .set(data as Record<string, unknown>)
      .where(eq(countryFieldConfig.id, id))
      .returning()
    return rows[0] as CountryFieldConfig
  }
}
```

- [ ] **Step 5: Run build and commit**

```bash
bun run --filter @future/db build
git add apps/api/src/modules/people/domain/entities/country-field-config* \
  apps/api/src/modules/people/domain/repositories/country-field-config* \
  apps/api/src/modules/people/infrastructure/schema/extensibility.schema.ts \
  apps/api/src/modules/people/infrastructure/repositories/drizzle-country-field-config*
git commit -m "feat(people): add country field config schema, entity, repository"
```

---

## Task 2: Vietnam Seed Data

**Files:**

- Create: `apps/api/src/modules/people/infrastructure/seed/vietnam-country-fields.seed.ts`

- [ ] **Step 1: Create Vietnam seed data**

```typescript
// apps/api/src/modules/people/infrastructure/seed/vietnam-country-fields.seed.ts

import type { CountryFieldConfig } from '../../domain/entities/country-field-config.entity'

export const VIETNAM_COUNTRY_FIELDS: Omit<CountryFieldConfig, 'id'>[] = [
  {
    countryCode: 'VN',
    fieldKey: 'citizen_id',
    label: 'Citizen ID',
    labelLocale: { vi: 'Số CCCD', en: 'Citizen ID' },
    fieldType: 'text',
    fieldGroup: 'identity',
    isRequired: true,
    sortOrder: 1,
    validation: { regex: '^\\d{12}$' },
    options: null,
  },
  {
    countryCode: 'VN',
    fieldKey: 'legacy_citizen_id',
    label: 'Legacy Citizen ID',
    labelLocale: { vi: 'Số CMND', en: 'Legacy Citizen ID' },
    fieldType: 'text',
    fieldGroup: 'identity',
    isRequired: false,
    sortOrder: 2,
    validation: { regex: '^\\d{9}$' },
    options: null,
  },
  {
    countryCode: 'VN',
    fieldKey: 'citizen_id_issue_place',
    label: 'Citizen ID Issue Place',
    labelLocale: { vi: 'Nơi cấp CCCD', en: 'Citizen ID Issue Place' },
    fieldType: 'text',
    fieldGroup: 'identity',
    isRequired: false,
    sortOrder: 3,
    validation: null,
    options: null,
  },
  {
    countryCode: 'VN',
    fieldKey: 'registered_address',
    label: 'Permanent Registration Address',
    labelLocale: { vi: 'Địa chỉ hộ khẩu', en: 'Permanent Registration Address' },
    fieldType: 'text',
    fieldGroup: 'identity',
    isRequired: false,
    sortOrder: 4,
    validation: null,
    options: null,
  },
  {
    countryCode: 'VN',
    fieldKey: 'vehicle_plate',
    label: 'Vehicle Plate',
    labelLocale: { vi: 'Biển số xe', en: 'Vehicle Plate' },
    fieldType: 'text',
    fieldGroup: 'vehicle',
    isRequired: false,
    sortOrder: 5,
    validation: null,
    options: null,
  },
  {
    countryCode: 'VN',
    fieldKey: 'vehicle_type',
    label: 'Vehicle Type',
    labelLocale: { vi: 'Loại xe', en: 'Vehicle Type' },
    fieldType: 'select',
    fieldGroup: 'vehicle',
    isRequired: false,
    sortOrder: 6,
    validation: null,
    options: [
      { value: 'motorbike', label: 'Motorbike' },
      { value: 'car', label: 'Car' },
      { value: 'bicycle', label: 'Bicycle' },
    ],
  },
]
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/people/infrastructure/seed/vietnam-country-fields.seed.ts
git commit -m "feat(people): add Vietnam country field config seed data"
```

---

## Task 3: Singapore Seed Data

**Files:**

- Create: `apps/api/src/modules/people/infrastructure/seed/singapore-country-fields.seed.ts`

- [ ] **Step 1: Create Singapore seed data**

```typescript
// apps/api/src/modules/people/infrastructure/seed/singapore-country-fields.seed.ts

import type { CountryFieldConfig } from '../../domain/entities/country-field-config.entity'

export const SINGAPORE_COUNTRY_FIELDS: Omit<CountryFieldConfig, 'id'>[] = [
  {
    countryCode: 'SG',
    fieldKey: 'nric_fin',
    label: 'NRIC/FIN',
    labelLocale: { en: 'NRIC/FIN' },
    fieldType: 'text',
    fieldGroup: 'identity',
    isRequired: true,
    sortOrder: 1,
    validation: { regex: '^[STFGM]\\d{7}[A-Z]$' },
    options: null,
  },
  {
    countryCode: 'SG',
    fieldKey: 'race',
    label: 'Race',
    labelLocale: { en: 'Race' },
    fieldType: 'select',
    fieldGroup: 'identity',
    isRequired: true,
    sortOrder: 2,
    validation: null,
    options: [
      { value: 'chinese', label: 'Chinese' },
      { value: 'malay', label: 'Malay' },
      { value: 'indian', label: 'Indian' },
      { value: 'eurasian', label: 'Eurasian' },
      { value: 'other', label: 'Other' },
    ],
  },
  {
    countryCode: 'SG',
    fieldKey: 'cpf_account_number',
    label: 'CPF Account Number',
    labelLocale: { en: 'CPF Account Number' },
    fieldType: 'text',
    fieldGroup: 'social_insurance',
    isRequired: false,
    sortOrder: 3,
    validation: null,
    options: null,
  },
  {
    countryCode: 'SG',
    fieldKey: 'work_pass_type',
    label: 'Work Pass Type',
    labelLocale: { en: 'Work Pass Type' },
    fieldType: 'select',
    fieldGroup: 'identity',
    isRequired: false,
    sortOrder: 4,
    validation: null,
    options: [
      { value: 'ep', label: 'Employment Pass' },
      { value: 'sp', label: 'S Pass' },
      { value: 'wp', label: 'Work Permit' },
      { value: 'dp', label: 'Dependant Pass' },
      { value: 'ltvp', label: 'Long Term Visit Pass' },
      { value: 'citizen', label: 'Citizen / PR' },
    ],
  },
  {
    countryCode: 'SG',
    fieldKey: 'work_pass_expiry',
    label: 'Work Pass Expiry Date',
    labelLocale: { en: 'Work Pass Expiry Date' },
    fieldType: 'date',
    fieldGroup: 'identity',
    isRequired: false,
    sortOrder: 5,
    validation: null,
    options: null,
  },
]
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/people/infrastructure/seed/singapore-country-fields.seed.ts
git commit -m "feat(people): add Singapore country field config seed data"
```

---

## Task 4: CountryFieldValidationService

**Files:**

- Create: `apps/api/src/modules/people/application/services/country-field-validation.service.ts`
- Create: `apps/api/src/modules/people/application/services/country-field-validation.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/modules/people/application/services/country-field-validation.service.spec.ts

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CountryFieldValidationService } from './country-field-validation.service'
import type { ICountryFieldConfigRepository } from '../../domain/repositories/country-field-config.repository'

describe('CountryFieldValidationService', () => {
  let service: CountryFieldValidationService
  let configRepo: ICountryFieldConfigRepository

  beforeEach(() => {
    configRepo = {
      findById: vi.fn(),
      findByCountryCode: vi.fn(),
      findByCountryAndKey: vi.fn(),
      insertMany: vi.fn(),
      update: vi.fn(),
    }
    service = new CountryFieldValidationService(configRepo)
  })

  it('validates valid country data against config', async () => {
    vi.mocked(configRepo.findByCountryCode).mockResolvedValue([
      {
        id: '1',
        countryCode: 'VN',
        fieldKey: 'citizen_id',
        label: 'Citizen ID',
        labelLocale: null,
        fieldType: 'text',
        fieldGroup: 'identity',
        isRequired: true,
        sortOrder: 1,
        validation: { regex: '^\\d{12}$' },
        options: null,
      },
    ])

    const errors = await service.validate('VN', { citizen_id: '012345678901' })
    expect(errors).toEqual([])
  })

  it('returns error for missing required field', async () => {
    vi.mocked(configRepo.findByCountryCode).mockResolvedValue([
      {
        id: '1',
        countryCode: 'VN',
        fieldKey: 'citizen_id',
        label: 'Citizen ID',
        labelLocale: null,
        fieldType: 'text',
        fieldGroup: 'identity',
        isRequired: true,
        sortOrder: 1,
        validation: null,
        options: null,
      },
    ])

    const errors = await service.validate('VN', {})
    expect(errors).toHaveLength(1)
    expect(errors[0]).toEqual(
      expect.objectContaining({
        fieldKey: 'citizen_id',
        message: expect.stringContaining('required'),
      }),
    )
  })

  it('returns error for invalid regex pattern', async () => {
    vi.mocked(configRepo.findByCountryCode).mockResolvedValue([
      {
        id: '1',
        countryCode: 'VN',
        fieldKey: 'citizen_id',
        label: 'Citizen ID',
        labelLocale: null,
        fieldType: 'text',
        fieldGroup: 'identity',
        isRequired: true,
        sortOrder: 1,
        validation: { regex: '^\\d{12}$' },
        options: null,
      },
    ])

    const errors = await service.validate('VN', { citizen_id: 'INVALID' })
    expect(errors).toHaveLength(1)
    expect(errors[0].fieldKey).toBe('citizen_id')
  })

  it('validates select field against allowed options', async () => {
    vi.mocked(configRepo.findByCountryCode).mockResolvedValue([
      {
        id: '1',
        countryCode: 'VN',
        fieldKey: 'vehicle_type',
        label: 'Vehicle Type',
        labelLocale: null,
        fieldType: 'select',
        fieldGroup: 'vehicle',
        isRequired: false,
        sortOrder: 1,
        validation: null,
        options: [
          { value: 'motorbike', label: 'Motorbike' },
          { value: 'car', label: 'Car' },
        ],
      },
    ])

    const errors = await service.validate('VN', { vehicle_type: 'truck' })
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain('invalid option')
  })

  it('returns empty array for unknown country', async () => {
    vi.mocked(configRepo.findByCountryCode).mockResolvedValue([])
    const errors = await service.validate('XX', { any_field: 'value' })
    expect(errors).toEqual([])
  })
})
```

- [ ] **Step 2: Implement the service**

```typescript
// apps/api/src/modules/people/application/services/country-field-validation.service.ts

import { Inject, Injectable } from '@nestjs/common'
import {
  COUNTRY_FIELD_CONFIG_REPOSITORY,
  type ICountryFieldConfigRepository,
} from '../../domain/repositories/country-field-config.repository'

export interface FieldValidationError {
  fieldKey: string
  message: string
}

@Injectable()
export class CountryFieldValidationService {
  constructor(
    @Inject(COUNTRY_FIELD_CONFIG_REPOSITORY)
    private readonly configRepo: ICountryFieldConfigRepository,
  ) {}

  async validate(
    countryCode: string,
    countryData: Record<string, unknown>,
  ): Promise<FieldValidationError[]> {
    const configs = await this.configRepo.findByCountryCode(countryCode)
    if (configs.length === 0) return []

    const errors: FieldValidationError[] = []

    for (const config of configs) {
      const value = countryData[config.fieldKey]

      // Required check
      if (config.isRequired && (value === undefined || value === null || value === '')) {
        errors.push({
          fieldKey: config.fieldKey,
          message: `${config.label} is required`,
        })
        continue
      }

      if (value === undefined || value === null || value === '') continue

      // Type-specific validation
      if (config.fieldType === 'text' && typeof value === 'string') {
        if (config.validation?.regex) {
          const regex = new RegExp(config.validation.regex)
          if (!regex.test(value)) {
            errors.push({
              fieldKey: config.fieldKey,
              message: `${config.label} does not match required format`,
            })
          }
        }
        if (config.validation?.minLength && value.length < config.validation.minLength) {
          errors.push({
            fieldKey: config.fieldKey,
            message: `${config.label} must be at least ${config.validation.minLength} characters`,
          })
        }
        if (config.validation?.maxLength && value.length > config.validation.maxLength) {
          errors.push({
            fieldKey: config.fieldKey,
            message: `${config.label} must be at most ${config.validation.maxLength} characters`,
          })
        }
      }

      if (config.fieldType === 'select' && config.options) {
        const allowedValues = config.options.map((o) => o.value)
        if (!allowedValues.includes(value as string)) {
          errors.push({
            fieldKey: config.fieldKey,
            message: `${config.label} has invalid option: ${value}`,
          })
        }
      }
    }

    return errors
  }
}
```

- [ ] **Step 3: Run tests and commit**

```bash
cd apps/api && bunx vitest run src/modules/people/application/services/country-field-validation.service.spec.ts
git add apps/api/src/modules/people/application/services/country-field-validation*
git commit -m "feat(people): add CountryFieldValidationService for country_data JSONB validation"
```

---

## Task 5: Custom Field Definition Schema + Entity + Repository + Drizzle Repo

**Files:**

- Create: entity, repository, Drizzle repo (schema already in Task 1)

- [ ] **Step 1: Create entity**

```typescript
// apps/api/src/modules/people/domain/entities/custom-field-definition.entity.ts

export interface CustomFieldDefinition {
  id: string
  tenantId: string
  fieldKey: string
  label: string
  fieldType: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'multi_select'
  fieldGroup: string | null
  isRequired: boolean
  isSearchable: boolean
  isFilterable: boolean
  sortOrder: number
  validation: CustomFieldValidation | null
  options: CustomFieldOption[] | null
  visibilityTier: 'public' | 'restricted' | 'confidential'
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface CustomFieldValidation {
  min?: number
  max?: number
  maxLength?: number
  regex?: string
}

export interface CustomFieldOption {
  value: string
  label: string
}
```

- [ ] **Step 2: Create repository interface**

```typescript
// apps/api/src/modules/people/domain/repositories/custom-field-definition.repository.ts

import type { CustomFieldDefinition } from '../entities/custom-field-definition.entity'

export const CUSTOM_FIELD_DEFINITION_REPOSITORY = Symbol('ICustomFieldDefinitionRepository')

export interface ICustomFieldDefinitionRepository {
  findById(id: string, tenantId: string): Promise<CustomFieldDefinition | null>
  findByFieldKey(fieldKey: string, tenantId: string): Promise<CustomFieldDefinition | null>
  findByTenant(tenantId: string, activeOnly?: boolean): Promise<CustomFieldDefinition[]>
  insert(
    data: Omit<CustomFieldDefinition, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<CustomFieldDefinition>
  update(
    id: string,
    tenantId: string,
    data: Partial<Omit<CustomFieldDefinition, 'id' | 'tenantId' | 'fieldKey' | 'createdAt'>>,
  ): Promise<CustomFieldDefinition>
}
```

- [ ] **Step 3: Implement Drizzle repo** — standard CRUD. `findByTenant` accepts optional `activeOnly` filter.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/people/domain/entities/custom-field-definition* \
  apps/api/src/modules/people/domain/repositories/custom-field-definition* \
  apps/api/src/modules/people/infrastructure/repositories/drizzle-custom-field-definition*
git commit -m "feat(people): add custom field definition entity and repository"
```

---

## Task 6: CustomFieldValidationService

**Files:**

- Create: service + spec

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/modules/people/application/services/custom-field-validation.service.spec.ts

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CustomFieldValidationService } from './custom-field-validation.service'
import type { ICustomFieldDefinitionRepository } from '../../domain/repositories/custom-field-definition.repository'

describe('CustomFieldValidationService', () => {
  let service: CustomFieldValidationService
  let defRepo: ICustomFieldDefinitionRepository

  beforeEach(() => {
    defRepo = {
      findById: vi.fn(),
      findByFieldKey: vi.fn(),
      findByTenant: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    service = new CustomFieldValidationService(defRepo)
  })

  it('validates valid custom fields', async () => {
    vi.mocked(defRepo.findByTenant).mockResolvedValue([
      {
        id: '1',
        tenantId: 't1',
        fieldKey: 'tshirt_size',
        label: 'T-Shirt Size',
        fieldType: 'select',
        fieldGroup: null,
        isRequired: false,
        isSearchable: false,
        isFilterable: false,
        sortOrder: 1,
        validation: null,
        options: [
          { value: 'S', label: 'Small' },
          { value: 'M', label: 'Medium' },
          { value: 'L', label: 'Large' },
        ],
        visibilityTier: 'public',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    const errors = await service.validate('t1', { tshirt_size: 'M' })
    expect(errors).toEqual([])
  })

  it('returns error for required custom field missing', async () => {
    vi.mocked(defRepo.findByTenant).mockResolvedValue([
      {
        id: '1',
        tenantId: 't1',
        fieldKey: 'badge_number',
        label: 'Badge Number',
        fieldType: 'text',
        fieldGroup: null,
        isRequired: true,
        isSearchable: false,
        isFilterable: false,
        sortOrder: 1,
        validation: null,
        options: null,
        visibilityTier: 'public',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    const errors = await service.validate('t1', {})
    expect(errors).toHaveLength(1)
    expect(errors[0].fieldKey).toBe('badge_number')
  })

  it('skips inactive field definitions', async () => {
    vi.mocked(defRepo.findByTenant).mockResolvedValue([
      {
        id: '1',
        tenantId: 't1',
        fieldKey: 'old_field',
        label: 'Old Field',
        fieldType: 'text',
        fieldGroup: null,
        isRequired: true,
        isSearchable: false,
        isFilterable: false,
        sortOrder: 1,
        validation: null,
        options: null,
        visibilityTier: 'public',
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    const errors = await service.validate('t1', {})
    expect(errors).toEqual([])
  })

  it('validates number field with min/max', async () => {
    vi.mocked(defRepo.findByTenant).mockResolvedValue([
      {
        id: '1',
        tenantId: 't1',
        fieldKey: 'years_exp',
        label: 'Years Experience',
        fieldType: 'number',
        fieldGroup: null,
        isRequired: false,
        isSearchable: false,
        isFilterable: false,
        sortOrder: 1,
        validation: { min: 0, max: 50 },
        options: null,
        visibilityTier: 'public',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    const errors = await service.validate('t1', { years_exp: 60 })
    expect(errors).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Implement service** — same pattern as CountryFieldValidationService but reads from `ICustomFieldDefinitionRepository`, filters by `isActive`, validates types/options/ranges.

- [ ] **Step 3: Run tests and commit**

```bash
cd apps/api && bunx vitest run src/modules/people/application/services/custom-field-validation.service.spec.ts
git add apps/api/src/modules/people/application/services/custom-field-validation*
git commit -m "feat(people): add CustomFieldValidationService for custom_fields JSONB validation"
```

---

## Task 7: CreateCustomFieldDefinition Command + Handler + Test

**Files:**

- Create: command, handler, spec

- [ ] **Step 1: Write command class**

```typescript
// apps/api/src/modules/people/application/commands/create-custom-field-definition.command.ts

export class CreateCustomFieldDefinitionCommand {
  constructor(
    readonly tenantId: string,
    readonly fieldKey: string,
    readonly label: string,
    readonly fieldType: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'multi_select',
    readonly createdBy: string,
    readonly fieldGroup?: string | null,
    readonly isRequired?: boolean,
    readonly isSearchable?: boolean,
    readonly isFilterable?: boolean,
    readonly sortOrder?: number,
    readonly validation?: Record<string, unknown> | null,
    readonly options?: Array<{ value: string; label: string }> | null,
    readonly visibilityTier?: 'public' | 'restricted' | 'confidential',
  ) {}
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// apps/api/src/modules/people/application/commands/create-custom-field-definition.handler.spec.ts

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateCustomFieldDefinitionCommand } from './create-custom-field-definition.command'
import { CreateCustomFieldDefinitionHandler } from './create-custom-field-definition.handler'
import type { ICustomFieldDefinitionRepository } from '../../domain/repositories/custom-field-definition.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const DEF_ID = '01900000-0000-7000-8000-000000000003'

describe('CreateCustomFieldDefinitionHandler', () => {
  let handler: CreateCustomFieldDefinitionHandler
  let defRepo: ICustomFieldDefinitionRepository

  beforeEach(() => {
    defRepo = {
      findById: vi.fn(),
      findByFieldKey: vi.fn(),
      findByTenant: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    handler = new CreateCustomFieldDefinitionHandler(defRepo)
  })

  it('creates a custom field definition', async () => {
    vi.mocked(defRepo.findByFieldKey).mockResolvedValue(null)
    vi.mocked(defRepo.insert).mockResolvedValue({
      id: DEF_ID,
      tenantId: TENANT_ID,
      fieldKey: 'tshirt_size',
      label: 'T-Shirt Size',
      fieldType: 'select',
      fieldGroup: null,
      isRequired: false,
      isSearchable: false,
      isFilterable: false,
      sortOrder: 0,
      validation: null,
      options: [{ value: 'S', label: 'Small' }],
      visibilityTier: 'public',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const result = await handler.execute(
      new CreateCustomFieldDefinitionCommand(
        TENANT_ID,
        'tshirt_size',
        'T-Shirt Size',
        'select',
        ACTOR_ID,
        null,
        false,
        false,
        false,
        0,
        null,
        [{ value: 'S', label: 'Small' }],
        'public',
      ),
    )

    expect(result.id).toBe(DEF_ID)
    expect(defRepo.insert).toHaveBeenCalled()
  })

  it('throws when field key already exists for tenant', async () => {
    vi.mocked(defRepo.findByFieldKey).mockResolvedValue({ id: 'existing' } as any)

    await expect(
      handler.execute(
        new CreateCustomFieldDefinitionCommand(
          TENANT_ID,
          'tshirt_size',
          'T-Shirt Size',
          'select',
          ACTOR_ID,
        ),
      ),
    ).rejects.toThrow()
  })
})
```

- [ ] **Step 3: Implement handler** — checks fieldKey uniqueness per tenant, creates definition.

- [ ] **Step 4: Run tests and commit**

```bash
cd apps/api && bunx vitest run src/modules/people/application/commands/create-custom-field-definition.handler.spec.ts
git add apps/api/src/modules/people/application/commands/create-custom-field-definition*
git commit -m "feat(people): add CreateCustomFieldDefinition command"
```

---

## Task 8: UpdateCustomFieldDefinition Command + Handler + Test

**Files:**

- Create: command, handler, spec

- [ ] **Step 1: Write command class**

```typescript
// apps/api/src/modules/people/application/commands/update-custom-field-definition.command.ts

export class UpdateCustomFieldDefinitionCommand {
  constructor(
    readonly tenantId: string,
    readonly fieldDefinitionId: string,
    readonly updatedBy: string,
    readonly label?: string,
    readonly fieldGroup?: string | null,
    readonly isRequired?: boolean,
    readonly isSearchable?: boolean,
    readonly isFilterable?: boolean,
    readonly sortOrder?: number,
    readonly validation?: Record<string, unknown> | null,
    readonly options?: Array<{ value: string; label: string }> | null,
    readonly visibilityTier?: 'public' | 'restricted' | 'confidential',
    readonly isActive?: boolean,
  ) {}
}
```

- [ ] **Step 2: Write test** — validates definition exists, updates allowed fields, rejects fieldKey/fieldType changes.

- [ ] **Step 3: Implement handler**

- [ ] **Step 4: Run tests and commit**

```bash
cd apps/api && bunx vitest run src/modules/people/application/commands/update-custom-field-definition.handler.spec.ts
git add apps/api/src/modules/people/application/commands/update-custom-field-definition*
git commit -m "feat(people): add UpdateCustomFieldDefinition command (no key/type rename)"
```

---

## Task 9: Field Visibility Config Schema + Entity + Repository + Drizzle Repo

**Files:**

- Create: entity, repository, Drizzle repo (schema already in Task 1)

- [ ] **Step 1: Create visibility tier value object**

```typescript
// apps/api/src/modules/people/domain/value-objects/visibility-tier.ts

export type VisibilityTier = 'public' | 'restricted' | 'confidential'

export const VISIBILITY_TIER_VALUES: VisibilityTier[] = ['public', 'restricted', 'confidential']

/**
 * Returns the tiers a viewer is allowed to see.
 * Higher tiers include all lower tiers.
 */
export function getAllowedTiers(maxTier: VisibilityTier): VisibilityTier[] {
  switch (maxTier) {
    case 'confidential':
      return ['public', 'restricted', 'confidential']
    case 'restricted':
      return ['public', 'restricted']
    case 'public':
      return ['public']
  }
}
```

- [ ] **Step 2: Create entity**

```typescript
// apps/api/src/modules/people/domain/entities/field-visibility-config.entity.ts

import type { VisibilityTier } from '../value-objects/visibility-tier'

export interface FieldVisibilityConfig {
  id: string
  tenantId: string
  fieldPath: string
  visibilityTier: VisibilityTier
}
```

- [ ] **Step 3: Create repository interface**

```typescript
// apps/api/src/modules/people/domain/repositories/field-visibility-config.repository.ts

import type { FieldVisibilityConfig } from '../entities/field-visibility-config.entity'

export const FIELD_VISIBILITY_CONFIG_REPOSITORY = Symbol('IFieldVisibilityConfigRepository')

export interface IFieldVisibilityConfigRepository {
  findByTenant(tenantId: string): Promise<FieldVisibilityConfig[]>
  findByFieldPath(fieldPath: string, tenantId: string): Promise<FieldVisibilityConfig | null>
  upsert(data: Omit<FieldVisibilityConfig, 'id'>): Promise<FieldVisibilityConfig>
  upsertMany(data: Omit<FieldVisibilityConfig, 'id'>[]): Promise<FieldVisibilityConfig[]>
}
```

- [ ] **Step 4: Implement Drizzle repo and commit**

```bash
git add apps/api/src/modules/people/domain/value-objects/visibility-tier* \
  apps/api/src/modules/people/domain/entities/field-visibility-config* \
  apps/api/src/modules/people/domain/repositories/field-visibility-config* \
  apps/api/src/modules/people/infrastructure/repositories/drizzle-field-visibility-config*
git commit -m "feat(people): add field visibility config entity and repository"
```

---

## Task 10: FieldVisibilityFilter Service

**Files:**

- Create: service + spec

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/modules/people/application/services/field-visibility-filter.service.spec.ts

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FieldVisibilityFilterService } from './field-visibility-filter.service'
import type { IFieldVisibilityConfigRepository } from '../../domain/repositories/field-visibility-config.repository'
import type { IJobAssignmentRepository } from '../../domain/repositories/job-assignment.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const VIEWER_ID = '01900000-0000-7000-8000-000000000002'
const TARGET_EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000003'

describe('FieldVisibilityFilterService', () => {
  let service: FieldVisibilityFilterService
  let visibilityRepo: IFieldVisibilityConfigRepository
  let assignmentRepo: IJobAssignmentRepository

  beforeEach(() => {
    visibilityRepo = {
      findByTenant: vi.fn(),
      findByFieldPath: vi.fn(),
      upsert: vi.fn(),
      upsertMany: vi.fn(),
    }
    assignmentRepo = {
      findById: vi.fn(),
      findCurrent: vi.fn(),
      findAsOf: vi.fn(),
      findHistory: vi.fn(),
      insert: vi.fn(),
      closeAssignment: vi.fn(),
      delete: vi.fn(),
    }
    service = new FieldVisibilityFilterService(visibilityRepo, assignmentRepo)
  })

  it('returns all fields for self-view', async () => {
    vi.mocked(visibilityRepo.findByTenant).mockResolvedValue([
      {
        id: '1',
        tenantId: TENANT_ID,
        fieldPath: 'person_profile.date_of_birth',
        visibilityTier: 'restricted',
      },
      {
        id: '2',
        tenantId: TENANT_ID,
        fieldPath: 'employment_detail.national_id',
        visibilityTier: 'confidential',
      },
    ])

    const maxTier = await service.resolveMaxTier(
      TENANT_ID,
      VIEWER_ID,
      TARGET_EMPLOYMENT_ID,
      true, // isSelf
      false, // hasConfidentialPermission
      false, // hasRestrictedPermission
    )

    expect(maxTier).toBe('confidential')
  })

  it('returns public only for general viewer', async () => {
    const maxTier = await service.resolveMaxTier(
      TENANT_ID,
      VIEWER_ID,
      TARGET_EMPLOYMENT_ID,
      false,
      false,
      false,
    )

    expect(maxTier).toBe('public')
  })

  it('returns restricted for direct manager', async () => {
    vi.mocked(assignmentRepo.findCurrent).mockResolvedValue({
      managerId: VIEWER_ID,
    } as any)

    const maxTier = await service.resolveMaxTier(
      TENANT_ID,
      VIEWER_ID,
      TARGET_EMPLOYMENT_ID,
      false,
      false,
      false,
    )

    expect(maxTier).toBe('restricted')
  })

  it('returns confidential for HR with permission', async () => {
    const maxTier = await service.resolveMaxTier(
      TENANT_ID,
      VIEWER_ID,
      TARGET_EMPLOYMENT_ID,
      false,
      true, // hasConfidentialPermission
      false,
    )

    expect(maxTier).toBe('confidential')
  })

  it('strips unauthorized fields from profile data', async () => {
    vi.mocked(visibilityRepo.findByTenant).mockResolvedValue([
      {
        id: '1',
        tenantId: TENANT_ID,
        fieldPath: 'person_profile.date_of_birth',
        visibilityTier: 'restricted',
      },
      {
        id: '2',
        tenantId: TENANT_ID,
        fieldPath: 'employment_detail.national_id',
        visibilityTier: 'confidential',
      },
      {
        id: '3',
        tenantId: TENANT_ID,
        fieldPath: 'person_profile.full_name',
        visibilityTier: 'public',
      },
    ])

    const data = {
      'person_profile.full_name': 'John Smith',
      'person_profile.date_of_birth': '1990-01-01',
      'employment_detail.national_id': '123456789',
    }

    const filtered = await service.filterFields(TENANT_ID, data, 'public')
    expect(filtered).toEqual({ 'person_profile.full_name': 'John Smith' })
    expect(filtered).not.toHaveProperty('person_profile.date_of_birth')
    expect(filtered).not.toHaveProperty('employment_detail.national_id')
  })
})
```

- [ ] **Step 2: Implement service**

```typescript
// apps/api/src/modules/people/application/services/field-visibility-filter.service.ts

import { Inject, Injectable } from '@nestjs/common'
import {
  FIELD_VISIBILITY_CONFIG_REPOSITORY,
  type IFieldVisibilityConfigRepository,
} from '../../domain/repositories/field-visibility-config.repository'
import {
  JOB_ASSIGNMENT_REPOSITORY,
  type IJobAssignmentRepository,
} from '../../domain/repositories/job-assignment.repository'
import { type VisibilityTier, getAllowedTiers } from '../../domain/value-objects/visibility-tier'

@Injectable()
export class FieldVisibilityFilterService {
  constructor(
    @Inject(FIELD_VISIBILITY_CONFIG_REPOSITORY)
    private readonly visibilityRepo: IFieldVisibilityConfigRepository,
    @Inject(JOB_ASSIGNMENT_REPOSITORY)
    private readonly assignmentRepo: IJobAssignmentRepository,
  ) {}

  async resolveMaxTier(
    tenantId: string,
    viewerEmploymentId: string,
    targetEmploymentId: string,
    isSelf: boolean,
    hasConfidentialPermission: boolean,
    hasRestrictedPermission: boolean,
  ): Promise<VisibilityTier> {
    // Self sees everything
    if (isSelf) return 'confidential'

    // HR or super admin with confidential permission
    if (hasConfidentialPermission) return 'confidential'

    // Check direct manager relationship
    const targetAssignment = await this.assignmentRepo.findCurrent(targetEmploymentId, tenantId)
    if (targetAssignment?.managerId === viewerEmploymentId) return 'restricted'

    // Executive with explicit restricted grant
    if (hasRestrictedPermission) return 'restricted'

    return 'public'
  }

  async filterFields(
    tenantId: string,
    data: Record<string, unknown>,
    maxTier: VisibilityTier,
  ): Promise<Record<string, unknown>> {
    const configs = await this.visibilityRepo.findByTenant(tenantId)
    const allowedTiers = new Set(getAllowedTiers(maxTier))

    const configMap = new Map(configs.map((c) => [c.fieldPath, c.visibilityTier]))
    const result: Record<string, unknown> = {}

    for (const [fieldPath, value] of Object.entries(data)) {
      const tier = configMap.get(fieldPath) ?? 'public'
      if (allowedTiers.has(tier)) {
        result[fieldPath] = value
      }
    }

    return result
  }
}
```

- [ ] **Step 3: Run tests and commit**

```bash
cd apps/api && bunx vitest run src/modules/people/application/services/field-visibility-filter.service.spec.ts
git add apps/api/src/modules/people/application/services/field-visibility-filter*
git commit -m "feat(people): add FieldVisibilityFilterService for field-level access control"
```

---

## Task 11: Field Edit Policy Schema + Entity + Repository + Drizzle Repo

**Files:**

- Create: entity, repository, Drizzle repo (schema already in Task 1)

- [ ] **Step 1: Create entity**

```typescript
// apps/api/src/modules/people/domain/entities/field-edit-policy.entity.ts

export type EditMode = 'self_service' | 'manager_approval' | 'hr_approval' | 'hr_only'

export interface FieldEditPolicy {
  id: string
  tenantId: string
  fieldPath: string
  editMode: EditMode
}
```

- [ ] **Step 2: Create repository interface**

```typescript
// apps/api/src/modules/people/domain/repositories/field-edit-policy.repository.ts

import type { FieldEditPolicy } from '../entities/field-edit-policy.entity'

export const FIELD_EDIT_POLICY_REPOSITORY = Symbol('IFieldEditPolicyRepository')

export interface IFieldEditPolicyRepository {
  findByTenant(tenantId: string): Promise<FieldEditPolicy[]>
  findByFieldPath(fieldPath: string, tenantId: string): Promise<FieldEditPolicy | null>
  upsert(data: Omit<FieldEditPolicy, 'id'>): Promise<FieldEditPolicy>
  upsertMany(data: Omit<FieldEditPolicy, 'id'>[]): Promise<FieldEditPolicy[]>
}
```

- [ ] **Step 3: Implement Drizzle repo and commit**

```bash
git add apps/api/src/modules/people/domain/entities/field-edit-policy* \
  apps/api/src/modules/people/domain/repositories/field-edit-policy* \
  apps/api/src/modules/people/infrastructure/repositories/drizzle-field-edit-policy*
git commit -m "feat(people): add field edit policy entity and repository"
```

---

## Task 12: EditPolicyService

**Files:**

- Create: service + spec

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/modules/people/application/services/edit-policy.service.spec.ts

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EditPolicyService } from './edit-policy.service'
import type { IFieldEditPolicyRepository } from '../../domain/repositories/field-edit-policy.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

describe('EditPolicyService', () => {
  let service: EditPolicyService
  let policyRepo: IFieldEditPolicyRepository

  beforeEach(() => {
    policyRepo = {
      findByTenant: vi.fn(),
      findByFieldPath: vi.fn(),
      upsert: vi.fn(),
      upsertMany: vi.fn(),
    }
    service = new EditPolicyService(policyRepo)
  })

  it('resolves self_service for preferred_name', async () => {
    vi.mocked(policyRepo.findByFieldPath).mockResolvedValue({
      id: '1',
      tenantId: TENANT_ID,
      fieldPath: 'person_profile.preferred_name',
      editMode: 'self_service',
    })

    const result = await service.resolveEditMode(
      TENANT_ID,
      'person_profile.preferred_name',
      false, // isHR
    )

    expect(result).toEqual({
      editMode: 'self_service',
      requiresApproval: false,
      canEdit: true,
    })
  })

  it('resolves hr_approval for bank account', async () => {
    vi.mocked(policyRepo.findByFieldPath).mockResolvedValue({
      id: '2',
      tenantId: TENANT_ID,
      fieldPath: 'employment_detail.bank_account_number',
      editMode: 'hr_approval',
    })

    const result = await service.resolveEditMode(
      TENANT_ID,
      'employment_detail.bank_account_number',
      false,
    )

    expect(result).toEqual({
      editMode: 'hr_approval',
      requiresApproval: true,
      canEdit: true,
    })
  })

  it('resolves hr_only blocks non-HR editors', async () => {
    vi.mocked(policyRepo.findByFieldPath).mockResolvedValue({
      id: '3',
      tenantId: TENANT_ID,
      fieldPath: 'employment.employment_type',
      editMode: 'hr_only',
    })

    const result = await service.resolveEditMode(TENANT_ID, 'employment.employment_type', false)

    expect(result).toEqual({
      editMode: 'hr_only',
      requiresApproval: false,
      canEdit: false,
    })
  })

  it('resolves hr_only allows HR editors', async () => {
    vi.mocked(policyRepo.findByFieldPath).mockResolvedValue({
      id: '3',
      tenantId: TENANT_ID,
      fieldPath: 'employment.employment_type',
      editMode: 'hr_only',
    })

    const result = await service.resolveEditMode(
      TENANT_ID,
      'employment.employment_type',
      true, // isHR
    )

    expect(result).toEqual({
      editMode: 'hr_only',
      requiresApproval: false,
      canEdit: true,
    })
  })

  it('defaults to hr_approval when no policy found', async () => {
    vi.mocked(policyRepo.findByFieldPath).mockResolvedValue(null)

    const result = await service.resolveEditMode(TENANT_ID, 'unknown.field', false)

    expect(result).toEqual({
      editMode: 'hr_approval',
      requiresApproval: true,
      canEdit: true,
    })
  })
})
```

- [ ] **Step 2: Implement service**

```typescript
// apps/api/src/modules/people/application/services/edit-policy.service.ts

import { Inject, Injectable } from '@nestjs/common'
import {
  FIELD_EDIT_POLICY_REPOSITORY,
  type IFieldEditPolicyRepository,
} from '../../domain/repositories/field-edit-policy.repository'
import type { EditMode } from '../../domain/entities/field-edit-policy.entity'

export interface EditPolicyResolution {
  editMode: EditMode
  requiresApproval: boolean
  canEdit: boolean
}

@Injectable()
export class EditPolicyService {
  constructor(
    @Inject(FIELD_EDIT_POLICY_REPOSITORY)
    private readonly policyRepo: IFieldEditPolicyRepository,
  ) {}

  async resolveEditMode(
    tenantId: string,
    fieldPath: string,
    isHR: boolean,
  ): Promise<EditPolicyResolution> {
    const policy = await this.policyRepo.findByFieldPath(fieldPath, tenantId)
    const editMode: EditMode = policy?.editMode ?? 'hr_approval'

    switch (editMode) {
      case 'self_service':
        return { editMode, requiresApproval: false, canEdit: true }
      case 'manager_approval':
        return { editMode, requiresApproval: true, canEdit: true }
      case 'hr_approval':
        return { editMode, requiresApproval: true, canEdit: true }
      case 'hr_only':
        return { editMode, requiresApproval: false, canEdit: isHR }
    }
  }
}
```

- [ ] **Step 3: Run tests and commit**

```bash
cd apps/api && bunx vitest run src/modules/people/application/services/edit-policy.service.spec.ts
git add apps/api/src/modules/people/application/services/edit-policy*
git commit -m "feat(people): add EditPolicyService for field change authorization"
```

---

## Task 13: Seed Default Field Visibility + Edit Policy

**Files:**

- Create: seed files

- [ ] **Step 1: Create default visibility seed**

```typescript
// apps/api/src/modules/people/infrastructure/seed/default-visibility.seed.ts

import type { FieldVisibilityConfig } from '../../domain/entities/field-visibility-config.entity'

/** Default field visibility tiers. Tenant can customize. */
export const DEFAULT_FIELD_VISIBILITY: Omit<FieldVisibilityConfig, 'id' | 'tenantId'>[] = [
  // Public tier — visible to all authenticated employees
  { fieldPath: 'person_profile.full_name', visibilityTier: 'public' },
  { fieldPath: 'person_profile.preferred_name', visibilityTier: 'public' },
  { fieldPath: 'person_profile.photo_document_id', visibilityTier: 'public' },
  { fieldPath: 'employment.company_email', visibilityTier: 'public' },
  { fieldPath: 'job_assignment.job_profile_id', visibilityTier: 'public' },
  { fieldPath: 'job_assignment.department_id', visibilityTier: 'public' },
  { fieldPath: 'job_assignment.location_id', visibilityTier: 'public' },
  { fieldPath: 'job_assignment.work_arrangement', visibilityTier: 'public' },

  // Restricted tier — self + direct manager + HR
  { fieldPath: 'person_profile.date_of_birth', visibilityTier: 'restricted' },
  { fieldPath: 'person_profile.gender', visibilityTier: 'restricted' },
  { fieldPath: 'person_profile.nationality', visibilityTier: 'restricted' },
  { fieldPath: 'person_profile.marital_status', visibilityTier: 'restricted' },
  { fieldPath: 'employment_detail.personal_email', visibilityTier: 'restricted' },
  { fieldPath: 'employment_detail.personal_phone', visibilityTier: 'restricted' },
  { fieldPath: 'employment_detail.current_address', visibilityTier: 'restricted' },
  { fieldPath: 'employment_detail.permanent_address', visibilityTier: 'restricted' },
  { fieldPath: 'employment_detail.emergency_contacts', visibilityTier: 'restricted' },

  // Confidential tier — self + HR only
  { fieldPath: 'employment_detail.national_id', visibilityTier: 'confidential' },
  { fieldPath: 'employment_detail.tax_id', visibilityTier: 'confidential' },
  { fieldPath: 'employment_detail.social_insurance_id', visibilityTier: 'confidential' },
  { fieldPath: 'employment_detail.passport_number', visibilityTier: 'confidential' },
  { fieldPath: 'employment_detail.bank_account_number', visibilityTier: 'confidential' },
  { fieldPath: 'employment_detail.bank_name', visibilityTier: 'confidential' },
  { fieldPath: 'employment_detail.bank_branch', visibilityTier: 'confidential' },
  { fieldPath: 'employment_detail.bank_account_holder', visibilityTier: 'confidential' },
  { fieldPath: 'employment_detail.bank_swift_code', visibilityTier: 'confidential' },
  { fieldPath: 'employment_detail.country_data', visibilityTier: 'confidential' },
  { fieldPath: 'contract_version.base_salary', visibilityTier: 'confidential' },
  { fieldPath: 'contract_version.salary_currency', visibilityTier: 'confidential' },
]
```

- [ ] **Step 2: Create default edit policy seed**

```typescript
// apps/api/src/modules/people/infrastructure/seed/default-edit-policy.seed.ts

import type { FieldEditPolicy } from '../../domain/entities/field-edit-policy.entity'

/** Default field edit policies. Tenant can customize. */
export const DEFAULT_FIELD_EDIT_POLICIES: Omit<FieldEditPolicy, 'id' | 'tenantId'>[] = [
  // Self-service — employee changes directly
  { fieldPath: 'person_profile.preferred_name', editMode: 'self_service' },
  { fieldPath: 'employment_detail.current_address', editMode: 'self_service' },
  { fieldPath: 'employment_detail.emergency_contacts', editMode: 'self_service' },
  { fieldPath: 'employment_detail.personal_email', editMode: 'self_service' },
  { fieldPath: 'employment_detail.personal_phone', editMode: 'self_service' },

  // HR approval — creates change request
  { fieldPath: 'person_profile.family_name', editMode: 'hr_approval' },
  { fieldPath: 'person_profile.given_name', editMode: 'hr_approval' },
  { fieldPath: 'person_profile.middle_name', editMode: 'hr_approval' },
  { fieldPath: 'employment_detail.bank_account_number', editMode: 'hr_approval' },
  { fieldPath: 'employment_detail.bank_name', editMode: 'hr_approval' },
  { fieldPath: 'employment_detail.bank_branch', editMode: 'hr_approval' },
  { fieldPath: 'employment_detail.bank_account_holder', editMode: 'hr_approval' },
  { fieldPath: 'employment_detail.bank_swift_code', editMode: 'hr_approval' },
  { fieldPath: 'employment_detail.national_id', editMode: 'hr_approval' },
  { fieldPath: 'employment_detail.tax_id', editMode: 'hr_approval' },

  // HR only — only HR can modify
  { fieldPath: 'employment.employment_type', editMode: 'hr_only' },
  { fieldPath: 'employment.worker_type', editMode: 'hr_only' },
  { fieldPath: 'employment.employment_status', editMode: 'hr_only' },
  { fieldPath: 'employment.employee_code', editMode: 'hr_only' },
  { fieldPath: 'employment.company_email', editMode: 'hr_only' },
  { fieldPath: 'job_assignment.job_profile_id', editMode: 'hr_only' },
  { fieldPath: 'job_assignment.department_id', editMode: 'hr_only' },
  { fieldPath: 'job_assignment.manager_id', editMode: 'hr_only' },
  { fieldPath: 'contract_version.base_salary', editMode: 'hr_only' },
]
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/people/infrastructure/seed/default-visibility.seed.ts \
  apps/api/src/modules/people/infrastructure/seed/default-edit-policy.seed.ts
git commit -m "feat(people): add default field visibility and edit policy seed data"
```

---

## Task 14: Wire into people.module.ts + tRPC Procedures for Settings CRUD

**Files:**

- Modify: `apps/api/src/modules/people/people.module.ts`
- Modify: `apps/api/src/modules/people/interface/trpc/people.router.ts`

- [ ] **Step 1: Add extensibility providers to people.module.ts**

```typescript
// Add to providers array in people.module.ts:

// Repositories
{ provide: COUNTRY_FIELD_CONFIG_REPOSITORY, useClass: DrizzleCountryFieldConfigRepository },
{ provide: CUSTOM_FIELD_DEFINITION_REPOSITORY, useClass: DrizzleCustomFieldDefinitionRepository },
{ provide: FIELD_VISIBILITY_CONFIG_REPOSITORY, useClass: DrizzleFieldVisibilityConfigRepository },
{ provide: FIELD_EDIT_POLICY_REPOSITORY, useClass: DrizzleFieldEditPolicyRepository },

// Services
CountryFieldValidationService,
CustomFieldValidationService,
FieldVisibilityFilterService,
EditPolicyService,

// Command handlers
CreateCustomFieldDefinitionHandler,
UpdateCustomFieldDefinitionHandler,
```

- [ ] **Step 2: Add tRPC procedures for settings**

```typescript
// Add to people.router.ts under a settings sub-router:

// Country field config (read-only, seeded)
getCountryFieldConfigs: protectedProcedure
  .input(z.object({ countryCode: z.string().length(2) }))
  .query(({ input }) =>
    countryFieldConfigRepo.findByCountryCode(input.countryCode),
  ),

// Custom field definitions CRUD
listCustomFieldDefinitions: protectedProcedure
  .query(({ ctx }) =>
    customFieldDefRepo.findByTenant(ctx.tenantId),
  ),

createCustomFieldDefinition: protectedProcedure
  .input(z.object({
    fieldKey: z.string().regex(/^[a-z][a-z0-9_]*$/),
    label: z.string().min(1),
    fieldType: z.enum(['text', 'number', 'date', 'boolean', 'select', 'multi_select']),
    fieldGroup: z.string().optional(),
    isRequired: z.boolean().default(false),
    isSearchable: z.boolean().default(false),
    isFilterable: z.boolean().default(false),
    sortOrder: z.number().int().default(0),
    validation: z.record(z.unknown()).optional(),
    options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
    visibilityTier: z.enum(['public', 'restricted', 'confidential']).default('public'),
  }))
  .mutation(({ ctx, input }) =>
    commandBus.execute(new CreateCustomFieldDefinitionCommand(
      ctx.tenantId, input.fieldKey, input.label, input.fieldType, ctx.actorId,
      input.fieldGroup, input.isRequired, input.isSearchable, input.isFilterable,
      input.sortOrder, input.validation, input.options, input.visibilityTier,
    )),
  ),

updateCustomFieldDefinition: protectedProcedure
  .input(z.object({
    id: z.string().uuid(),
    label: z.string().optional(),
    fieldGroup: z.string().nullable().optional(),
    isRequired: z.boolean().optional(),
    isSearchable: z.boolean().optional(),
    isFilterable: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    validation: z.record(z.unknown()).nullable().optional(),
    options: z.array(z.object({ value: z.string(), label: z.string() })).nullable().optional(),
    visibilityTier: z.enum(['public', 'restricted', 'confidential']).optional(),
    isActive: z.boolean().optional(),
  }))
  .mutation(({ ctx, input }) =>
    commandBus.execute(new UpdateCustomFieldDefinitionCommand(
      ctx.tenantId, input.id, ctx.actorId,
      input.label, input.fieldGroup, input.isRequired, input.isSearchable,
      input.isFilterable, input.sortOrder, input.validation as any, input.options,
      input.visibilityTier, input.isActive,
    )),
  ),

// Field visibility config
listFieldVisibilityConfigs: protectedProcedure
  .query(({ ctx }) =>
    fieldVisibilityConfigRepo.findByTenant(ctx.tenantId),
  ),

// Field edit policies
listFieldEditPolicies: protectedProcedure
  .query(({ ctx }) =>
    fieldEditPolicyRepo.findByTenant(ctx.tenantId),
  ),
```

- [ ] **Step 3: Run build and verify**

```bash
bun run --filter @future/db build
cd apps/api && bunx vitest run src/modules/people/ --reporter=verbose
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/people/people.module.ts \
  apps/api/src/modules/people/interface/trpc/people.router.ts
git commit -m "feat(people): wire multi-country and extensibility into module + tRPC"
```
