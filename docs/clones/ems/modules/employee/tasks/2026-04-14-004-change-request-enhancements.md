---
module: employee
task: change-request-enhancements
created: 2026-04-14
priority: high
depends-on: [001]
---

# Task: Profile Change Request Enhancements

## Scope

Enhance the existing `profile_change_request` system with:

1. Batch approval — approve/reject multiple field changes atomically
2. Effective dating — changes can specify a future effective date
3. Edit policy per field category — which fields are self-service vs need approval
4. Change request for profile sections (education, skills, etc.), not just scalar fields

## Roles Covered

- **EMPLOYEE:** Submit change requests for restricted fields, direct-edit permitted fields
- **MANAGER:** Approve/reject change requests for direct reports (for manager-approval fields)
- **HR:** Approve/reject all change requests, configure edit policies

## Business Context

The target already has per-field `profile_change_request` (superior to legacy's 10 shadow tables). But it needs enhancements to match HRM standards: batch operations for HR efficiency, effective dating for scheduled changes (e.g., "title changes on April 1"), and configurable edit policies so tenants can decide what needs approval.

## Source Reference

- **Files:** `src/core/services/employee_service.py` (update_employee_draft, approve_employee_draft, reject_employee_draft)
- **Key logic:** Legacy uses all-or-nothing draft approval. Target already has per-field model — this task enhances it.

## Target Location

- **Where:** `apps/api/src/modules/people/application/commands/`, `apps/api/src/modules/people/domain/`
- **Conventions to follow:** Existing command handler pattern (request-profile-change, approve-profile-change, reject-profile-change)

## Data Model

Enhance existing `profile_change_request` table:

- Add `effective_date date` — when the change should take effect (NULL = immediate)
- Add `batch_id uuid` — groups related changes for batch approval
- Add `section_id uuid` — FK to profile_section for section-level changes (NULL for scalar fields)

New table or config:

```
people.field_edit_policy
  id              uuid PK
  tenant_id       uuid NOT NULL
  field_category  text NOT NULL  -- 'personal_info' | 'employment_info' | 'financial_info' | 'skills' | 'education'
  edit_policy     text NOT NULL  -- 'self_service' | 'manager_approval' | 'hr_approval' | 'hr_only'
  created_at      timestamptz
  updated_at      timestamptz

  UNIQUE (tenant_id, field_category)
```

Default policies (seeded per tenant):

- `personal_info` → self_service (name, address, phone, emergency contacts)
- `skills`, `education`, `languages` → self_service
- `employment_info` → hr_only (title, department, status)
- `financial_info` → hr_approval (bank details)

## Interface Contract

Enhanced commands:

- `RequestProfileChangeCommand` — add `effectiveDate`, `batchId` fields
- `BatchApproveChangesCommand { profileId, changeRequestIds[], approvedBy }`
- `BatchRejectChangesCommand { profileId, changeRequestIds[], reason, rejectedBy }`
- `RequestSectionChangeCommand { profileId, sectionId, sectionType, oldPayload, newPayload }`

Queries:

- `ListPendingChangesQuery` — enhance with batch grouping, effective date display
- `GetEditPoliciesQuery { tenantId }` — return configured edit policies

pg-boss job:

- `apply-scheduled-changes` — runs daily, applies changes where `effective_date <= today` and status = approved

## Edge Cases

- Batch approval: if one change in a batch is invalid (e.g., duplicate email), reject the entire batch with error details
- Effective-dated change: approved but not yet effective — show as "scheduled" in UI
- Superseded changes: if a new change request targets the same field as a pending one, supersede the old one
- Section changes: track the full section payload diff, not individual JSONB fields

## Acceptance Criteria

- [ ] `effective_date` column added to `profile_change_request`
- [ ] `batch_id` column added for grouping
- [ ] Batch approve/reject command handlers
- [ ] `field_edit_policy` table with default seed data
- [ ] Change request routing: self-service fields skip approval, others routed by policy
- [ ] Section-level change requests (education, skills, etc.)
- [ ] pg-boss job for applying scheduled changes
- [ ] tRPC procedures for batch operations and policy management
- [ ] Unit tests for batch approval (all-or-nothing on validation failure)
- [ ] Unit tests for edit policy routing
- [ ] Integration test for effective-dated change lifecycle
