---
module: employee
task: schema-evolution
created: 2026-04-14
priority: high
depends-on: []
---

# Task: Schema Evolution + Job History

## Scope

Evolve the `people` schema with new tables and columns needed by downstream tasks. This is the foundation — all other employee tasks depend on this.

1. Add `job_history` table (effective-dated position/title/level/department/manager changes)
2. Enhance `employment_profile` with `previousProfileId`, `workLocation`, `countryCode`, `customFields` (jsonb)
3. Add new `profile_section` type enum values: `work_experience`, `emergency_contact`, `project_history`, `license`
4. Add `employee_document` table (file references with category, expiry, confidentiality)
5. Add `custom_field_definition` table (tenant-configurable field definitions)
6. Create Drizzle migration
7. Create domain entities and repository interfaces for new tables

## Roles Covered

- No direct role interaction — this is infrastructure for all other tasks

## Business Context

The `job_history` table is the #1 missing feature compared to every commercial HRM (BambooHR, HiBob, Personio). Without it, promotions, title changes, and department moves are lost — only the current state is stored. Effective-dated history enables: "show me this person's career progression", "who was in department X last quarter", "what was their title when this review happened".

## Source Reference

- **Files:** `src/core/models/employee.py`, `src/core/models/employee_related.py`, `src/core/enums/employee.py`
- **Key logic:** Legacy stores everything as mutable current state. No history tracking. Child entities use dedicated tables (9 tables) — target already improved this with JSONB `profile_section`.

## Target Location

- **Where:** `apps/api/src/modules/people/infrastructure/schema/people.schema.ts`, `packages/db/drizzle/migrations/`
- **Conventions to follow:** UUID v7 PKs, `tenant_id` on every table, camelCase columns, Drizzle `pgTable` definitions, `$inferInsert`/`$inferSelect` types

## Data Model

### New table: `job_history`

```
people.job_history
  id              uuid PK (uuidv7)
  tenant_id       uuid NOT NULL
  profile_id      uuid NOT NULL  -- FK to employment_profile
  effective_date  date NOT NULL
  end_date        date           -- NULL = current
  job_title       text NOT NULL
  job_level       text
  department_id   uuid           -- soft ref to core.department
  manager_id      uuid           -- soft ref to core.actor
  cost_center     text
  work_location   text
  work_arrangement text          -- onsite/hybrid/remote
  change_reason   text           -- promotion, lateral_move, reorganization, hire, correction
  created_at      timestamptz NOT NULL DEFAULT now()
```

Query pattern: `WHERE end_date IS NULL` = current. `WHERE effective_date <= :date AND (end_date IS NULL OR end_date > :date)` = as-of.

### New table: `employee_document`

```
people.employee_document
  id              uuid PK (uuidv7)
  tenant_id       uuid NOT NULL
  profile_id      uuid NOT NULL
  category        text NOT NULL  -- 'id_document' | 'tax_form' | 'policy_ack' | 'certificate' | 'visa' | 'other'
  name            text NOT NULL
  file_key        text NOT NULL  -- S3 key via @future/storage
  mime_type       text
  file_size       integer
  expiry_date     date
  is_confidential boolean NOT NULL DEFAULT false
  uploaded_by     uuid NOT NULL
  created_at      timestamptz NOT NULL DEFAULT now()
  updated_at      timestamptz NOT NULL DEFAULT now()
```

### New table: `custom_field_definition`

```
people.custom_field_definition
  id              uuid PK (uuidv7)
  tenant_id       uuid NOT NULL
  field_key       text NOT NULL       -- machine name, UNIQUE per tenant
  label           text NOT NULL
  field_type      text NOT NULL       -- 'text' | 'number' | 'date' | 'boolean' | 'select' | 'multi_select'
  options         jsonb               -- for select types: ["Option A", "Option B"]
  section         text NOT NULL       -- UI grouping: 'personal' | 'employment' | 'financial' | 'other'
  is_required     boolean NOT NULL DEFAULT false
  display_order   integer NOT NULL DEFAULT 0
  is_active       boolean NOT NULL DEFAULT true
  created_at      timestamptz NOT NULL DEFAULT now()
  updated_at      timestamptz NOT NULL DEFAULT now()

  UNIQUE (tenant_id, field_key)
```

### Modify: `employment_profile`

Add columns:

- `previous_profile_id uuid` — links rehires to prior employment
- `work_location text` — office/site name
- `country_code text` — ISO 3166-1 alpha-2
- `custom_fields jsonb DEFAULT '{}'` — tenant custom field values

### Modify: `profile_section`

Add to section type enum: `work_experience`, `emergency_contact`, `project_history`, `license`

## Interface Contract

Domain entities:

- `JobHistoryEntry` entity with factory method `createForHire(profile, title, level, dept, manager)`
- `EmployeeDocument` entity
- `CustomFieldDefinition` entity

Repository interfaces:

- `JobHistoryRepository`: `findCurrent(profileId)`, `findAsOf(profileId, date)`, `findAll(profileId)`, `save(entry)`, `closeEntry(id, endDate)`
- `EmployeeDocumentRepository`: `findByProfile(profileId)`, `findExpiring(tenantId, beforeDate)`, `save(doc)`, `delete(id)`
- `CustomFieldDefinitionRepository`: `findByTenant(tenantId)`, `save(def)`, `delete(id)`

## Edge Cases

- First `job_history` entry for a profile has no predecessor — `end_date` is NULL, `change_reason` is `hire`
- When creating a new job_history entry, must close the previous one (`end_date = new.effective_date`)
- Profile sections with new types need Zod payload schemas defined (e.g., `work_experience` payload: `{ company, title, startDate, endDate, description }`)
- `custom_fields` JSONB needs GIN index for query support
- `employee_document.file_key` references `@future/storage` — must validate key format

## Acceptance Criteria

- [ ] `job_history` table created with Drizzle schema and migration
- [ ] `employee_document` table created with Drizzle schema and migration
- [ ] `custom_field_definition` table created with Drizzle schema and migration
- [ ] `employment_profile` enhanced with new columns and migration
- [ ] `profile_section` enum extended with new types
- [ ] Zod payload schemas defined for each new profile section type
- [ ] Domain entities created for all new tables
- [ ] Repository interfaces defined in `domain/repositories/`
- [ ] Drizzle repository implementations in `infrastructure/repositories/`
- [ ] Unit tests for entity factory methods and value objects
- [ ] Migration runs cleanly against existing data (no breaking changes)
