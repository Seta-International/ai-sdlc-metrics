---
module: employee
task: custom-fields
created: 2026-04-14
priority: medium
depends-on: [001]
---

# Task: Custom Fields

## Scope

Implement tenant-configurable custom fields on employee profiles. Tenants define field definitions (type, label, options, required), employees fill in values stored as JSONB on `employment_profile.customFields`.

## Roles Covered

- **SUPER_ADMIN:** Create/update/delete custom field definitions, set required fields
- **HR:** Fill in custom field values on any profile
- **EMPLOYEE:** Fill in custom field values on own profile (if field allows self-service)

## Business Context

Every mid-market HRM (BambooHR, HiBob, Personio) has custom fields. Without them, tenants constantly request schema changes for company-specific data (t-shirt size, parking spot, dietary preference, internal badge number, etc.). Custom fields eliminate this bottleneck.

## Source Reference

- **Files:** No legacy equivalent — this is a new feature
- **Key logic:** N/A

## Target Location

- **Where:** `apps/api/src/modules/people/application/commands/`, `apps/api/src/modules/people/application/queries/`
- **Conventions to follow:** CQRS pattern, Zod validation

## Data Model

Uses `custom_field_definition` table and `employment_profile.customFields` JSONB column from task 001.

Field types: `text`, `number`, `date`, `boolean`, `select`, `multi_select`

Validation rules per type:

- `text`: optional max_length
- `number`: optional min/max
- `date`: valid ISO date
- `select`: value must be in `options` array
- `multi_select`: all values must be in `options` array

## Interface Contract

Commands:

- `CreateCustomFieldCommand { tenantId, fieldKey, label, fieldType, options?, section, isRequired, displayOrder }`
- `UpdateCustomFieldCommand { fieldId, label?, options?, isRequired?, displayOrder?, isActive? }`
- `DeleteCustomFieldCommand { fieldId }` — soft-delete (set isActive=false), preserve existing data
- `SetCustomFieldValuesCommand { profileId, values: Record<string, any> }` — bulk set

Queries:

- `ListCustomFieldDefinitionsQuery { tenantId }` — all active definitions, ordered by displayOrder
- Custom field values are returned inline with profile queries (embedded in profile response)

## Edge Cases

- Deleting a field definition: soft-delete, existing values remain in JSONB but stop rendering
- Renaming a field_key: not allowed (would orphan existing data). Change label instead.
- Required field enforcement: validated on profile save, not retroactively (existing profiles without the value are grandfathered)
- `select` options change: removing an option that's already used — warn but allow (existing values become "legacy")
- GIN index on `customFields` for query support

## Acceptance Criteria

- [ ] CRUD for custom field definitions (SUPER_ADMIN only)
- [ ] Validation engine that enforces field type rules on save
- [ ] Custom field values stored in `employment_profile.customFields` JSONB
- [ ] Values returned inline with profile queries
- [ ] Soft-delete for field definitions
- [ ] GIN index on customFields column
- [ ] tRPC procedures for definition management and value setting
- [ ] Unit tests for each field type validation
- [ ] Unit test for required field enforcement
- [ ] Integration test for full lifecycle (create definition → set value → query)
