---
module: employee
task: bulk-ops-csv-import
created: 2026-04-14
priority: medium
depends-on: [001, 003]
---

# Task: Bulk Operations + CSV Import

## Scope

Implement bulk operations for HR efficiency and CSV import for data migration/onboarding:

1. Bulk update — change department, status, manager for multiple employees at once
2. Bulk export — CSV/Excel export of filtered employee list
3. CSV import — upload CSV, map columns, validate, preview, commit

## Roles Covered

- **HR:** All bulk operations, import/export
- **SUPER_ADMIN:** All bulk operations, import/export

## Business Context

HR manages hundreds of employees. Updating department one-by-one after a reorg is unacceptable. CSV import is essential for initial data migration and for onboarding batches (e.g., graduate intake programs). Every commercial HRM has these features.

## Source Reference

- **Files:** `src/core/services/employee_service.py` (create_employee_migration — bulk creation path)
- **Key logic:** Legacy has a migration path for bulk creation but no UI-driven bulk ops or import.

## Target Location

- **Where:** `apps/api/src/modules/people/application/commands/`
- **Conventions to follow:** pg-boss for async processing of large imports, domain events for each affected employee

## Data Model

No new tables. Bulk operations modify existing records. Import uses a temporary staging approach:

```
people.import_job
  id              uuid PK
  tenant_id       uuid NOT NULL
  status          text NOT NULL  -- 'uploaded' | 'mapped' | 'validated' | 'committed' | 'failed'
  file_key        text NOT NULL  -- S3 key to uploaded CSV
  column_mapping  jsonb          -- { csvColumn: profileField }
  validation_result jsonb        -- { totalRows, validRows, errors: [{row, field, message}] }
  committed_count integer
  created_by      uuid NOT NULL
  created_at      timestamptz NOT NULL DEFAULT now()
  updated_at      timestamptz NOT NULL DEFAULT now()
```

## Interface Contract

Commands:

- `BulkUpdateDepartmentCommand { profileIds[], departmentId, effectiveDate }`
- `BulkUpdateStatusCommand { profileIds[], status, reason }` — with lifecycle validation per employee
- `BulkUpdateManagerCommand { profileIds[], managerId, effectiveDate }`
- `UploadImportFileCommand { tenantId, file }` — returns importJobId
- `MapImportColumnsCommand { importJobId, columnMapping }` — validate mapping
- `ValidateImportCommand { importJobId }` — dry-run, return errors
- `CommitImportCommand { importJobId }` — create/update employees

Queries:

- `ExportEmployeesQuery { tenantId, filters, format: 'csv' | 'xlsx' }` — filtered export
- `GetImportJobQuery { importJobId }` — status and validation results

pg-boss jobs:

- `process-import` — async validation and commit for large files (>100 rows)

Domain events:

- Each bulk update emits individual events per employee (e.g., `OrgPlacementChangedEvent` for each)
- Import emits `PersonCreatedEvent` for each new employee

## Edge Cases

- Bulk update with invalid transition: skip that employee, report in result (partial success)
- CSV encoding: handle UTF-8 BOM, Windows line endings, Vietnamese characters
- CSV column matching: fuzzy match suggestions (e.g., "Full Name" → `displayName`)
- Import duplicate detection: check email/phone/ID uniqueness before commit
- Large imports (1000+ rows): must be async via pg-boss, not synchronous
- Export with access control: only export fields the requester can see

## Acceptance Criteria

- [ ] Bulk update department/status/manager for selected employees
- [ ] Each bulk update creates job_history entries (effective-dated)
- [ ] Partial success reporting (which employees updated, which failed and why)
- [ ] CSV export with configurable columns and filters
- [ ] CSV import: upload → map columns → validate (dry-run) → preview → commit
- [ ] Import handles Vietnamese CSV (UTF-8 encoding)
- [ ] Async processing for large imports via pg-boss
- [ ] Import validation catches duplicates and required field violations
- [ ] Domain events emitted for each affected employee
- [ ] tRPC procedures for all operations
- [ ] Unit tests for column mapping and validation
- [ ] Integration test for full import lifecycle
