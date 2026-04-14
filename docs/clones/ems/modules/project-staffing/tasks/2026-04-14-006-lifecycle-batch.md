---
module: project-staffing
task: lifecycle-batch
created: 2026-04-14
priority: medium
depends-on: [001]
---

# Task: Account/Project Lifecycle & Batch Operations

## Scope

Complete CRUD gaps and add batch operations:

1. Archive (soft-delete) project and account commands
2. Project name uniqueness validation per account
3. Self-removal guard on allocations
4. Batch allocation creation
5. Enhanced allocation status workflow (proposed → tentative → confirmed)
6. Account membership (replace mocked stubs)

## Roles Covered

- **SUPER_ADMIN:** Archive accounts/projects, batch operations
- **HR:** Archive projects, batch allocations
- **ACCOUNT_MANAGER:** Archive projects in their account, batch allocations
- **PROJECT_MANAGER:** Cannot archive, but can batch-allocate on own project

## Business Context

Basic CRUD completeness — you can create projects but can't archive them. You can create allocations one at a time but can't staff a team in one operation. These are table-stakes features that every user expects.

The `proposed` allocation status enables planning workflows: PM proposes an allocation → resource manager reviews → confirms or rejects. Proposed allocations don't count against capacity, enabling "what if" planning.

## Source Reference

- **Files:** `src/core/services/project_service.py` (delete_project, remove_employee — legacy implementations)
- **Key logic:** Legacy hard-deletes projects and cascades to allocations/roles. Target should soft-delete (archive) by setting status to `closed`/`archived`.

## Target Location

- **Where:** `apps/api/src/modules/projects/application/commands/`
- **Conventions to follow:** Existing command handler pattern

## Data Model

No new tables. Uses existing tables with enhanced behavior.

Account membership (replace mocks):

- Account members are tracked implicitly through allocations to projects within the account
- OR explicitly via a new `account_member` table if explicit membership is needed

Recommendation: **implicit membership via allocations** is simpler and consistent with the demand-driven model. The "list account members" query aggregates distinct actors from allocations on the account's projects.

## Interface Contract

### Archive Commands

- `ArchiveProjectCommand { projectId, tenantId }` — sets project status to `closed`, closes all active allocations with `endedAt = now()`
- `ArchiveAccountCommand { accountId, tenantId }` — sets account status to `closed`, archives all projects in the account

### Validation

- Enhanced `CreateProjectCommand` — validate project name unique within account
- Enhanced `CreateAllocationCommand` / `UpdateAllocationCommand` — self-removal guard (cannot close/remove your own allocation)

### Batch Operations

- `BatchCreateAllocationsCommand { projectId, tenantId, allocations[] }` — create multiple allocations in one transaction

Each allocation in the batch:

```typescript
{
  projectRoleId: string
  actorId?: string
  position?: string
  hoursPerDay: string
  billingType: BillingType
  memberType?: MemberType
  startedAt: Date
  endedAt?: Date
  note?: string
}
```

### Enhanced Allocation Status

- Add `proposed` to existing status enum
- `ProposeAllocationCommand { ... }` — creates allocation with status `proposed`
- Proposed allocations:
  - Visible in staffing views with "proposed" badge
  - NOT counted in capacity calculations
  - Can be promoted to `tentative` or `confirmed`
  - Can be rejected (deleted)

### Account Membership (replace mocks)

- `ListAccountMembersQuery { accountId, tenantId }` — aggregate distinct actors from allocations on the account's projects, enriched with role info
- Remove mocked `addAccountMember` and `removeAccountMember` — membership is implicit

### tRPC procedures

- `projects.archiveProject`, `projects.archiveAccount`
- `projects.batchCreateAllocations`
- Enhanced `projects.createAllocation` with `proposed` status support
- `projects.listAccountMembers` — real implementation

## Edge Cases

- **Archive with active allocations:** Auto-close all allocations. Emit events for each closed allocation so time/finance modules react.
- **Archive account with active projects:** Must archive all projects first (cascading archive).
- **Batch allocation partial failure:** All-or-nothing transaction. If any allocation fails validation, reject the entire batch with per-item error details.
- **Self-removal guard:** Check `actorId` from auth context against allocation's actorId. Block with clear error message.
- **Project name uniqueness:** Case-insensitive comparison within the same account. Allow same name across different accounts.
- **Proposed → confirmed shortcut:** Allow skipping `tentative` (proposed → confirmed directly) for simple staffing workflows.
- **Re-opening archived project:** Set status back to `active`. Don't re-open closed allocations — create new ones.

## Acceptance Criteria

- [ ] Archive project command — closes project + all active allocations
- [ ] Archive account command — cascading archive to all projects
- [ ] Project name uniqueness validation (case-insensitive, per account)
- [ ] Self-removal guard on allocation close/remove
- [ ] Batch allocation creation (all-or-nothing)
- [ ] `proposed` allocation status — not counted in capacity
- [ ] Account membership query — real implementation (implicit via allocations)
- [ ] Events emitted for each closed allocation during archive
- [ ] tRPC procedures for all operations
- [ ] Unit tests for archive cascading
- [ ] Unit tests for batch validation (partial failure → full rejection)
- [ ] Unit tests for self-removal guard
- [ ] Integration test for archive → verify allocations closed → verify events emitted
