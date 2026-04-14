---
module: contract
task: lifecycle-versioning
created: 2026-04-14
priority: high
depends-on: [001, 005, 007]
---

# Task: Contract Lifecycle + Versioning

## Scope

Implement the full contract lifecycle in the `people` module:

1. Create initial contract version (draft)
2. Submit for approval (draft → pending_approval)
3. Activate contract (pending_approval → active, supersede previous active)
4. Amend contract (create new version with changed terms)
5. Extend contract (push end_date on fixed-term)
6. Terminate contract (active → terminated with reason)
7. Contract expiry dashboard (counts by period)
8. Link generated documents to contract versions

## Roles Covered

- **HR:** Create contracts, submit for approval, activate, amend, extend, terminate, view dashboard
- **MANAGER:** View direct reports' contracts, approve contracts (via kernel decision_case)
- **EMPLOYEE:** View own contract history, download own documents

## Business Context

The contract lifecycle is the core of employment formalization. Every employment change (hire, salary raise, role change, extension, termination) produces a contract version. The version chain provides complete audit trail and point-in-time queryability ("what were this person's terms on March 15?").

Vietnam labor law requires: max 2 consecutive fixed-term contracts, probation max 60 days, conversion to indefinite after 36 months. These rules must be enforced at creation/renewal time.

## Source Reference

- **Files:** `src/core/services/contract_service.py` (create_contract_version, save_contract_version, update_contract, get_all_active_contracts, get_expiring_statistics)
- **Key logic:** Legacy creates draft → activates (expires previous). No approval step, no amendment/extension distinction, no terms snapshot.

## Target Location

- **Where:** `apps/api/src/modules/people/application/commands/`, `apps/api/src/modules/people/application/queries/`
- **Conventions to follow:** CQRS handlers, domain events via outbox

## Data Model

Uses enhanced `contract_version` from task 001. No new tables.

Status transitions:

```
draft → pending_approval → active → expired (end_date passed)
                             ↓
                          superseded (new version created)
                             ↓
                          terminated (manual with reason)

amendment: active version → superseded, new version → active
extension: active version → superseded, new version → active (new end_date)
renewal: active version → expired, new contract chain starts (new initial version)
```

## Interface Contract

### Commands

```typescript
CreateContractVersionCommand {
  tenantId, profileId, contractTypeId, startedAt, endedAt?,
  probationEndDate?, terms: Record<string, any>, note?
}
// Creates draft version with change_type='initial'

SubmitContractForApprovalCommand { tenantId, contractVersionId }
// draft → pending_approval, optionally creates kernel decision_case

ActivateContractCommand { tenantId, contractVersionId }
// pending_approval → active, supersedes previous active version
// Emits ContractActivatedEvent

AmendContractCommand {
  tenantId, profileId, changedFields: Record<string, {from, to}>,
  effectiveDate, reason
}
// Creates new version with change_type='amendment', terms snapshot, supersedes current
// Emits ContractAmendedEvent

ExtendContractCommand { tenantId, profileId, newEndDate, reason }
// Creates new version with change_type='extension', supersedes current

TerminateContractCommand {
  tenantId, contractVersionId, terminationType: 'resignation'|'dismissal'|'mutual'|'end_of_term',
  effectiveDate, reason
}
// active → terminated
// Emits ContractTerminatedEvent

LinkDocumentToContractCommand { tenantId, contractVersionId, documentId }
// Sets document_id on contract version (called after document generation)
```

### Queries

```typescript
ListContractVersionsQuery { tenantId, profileId }
// Returns full version chain for an employee, ordered by version_number desc

GetActiveContractQuery { tenantId, profileId }
// Returns current active version with terms

ListAllContractsQuery { tenantId, filters, sort, page, pageSize }
// Paginated list of all employees with their latest contract version
// Filters: status, contractType, expiringBefore, department

GetContractExpiryStatsQuery { tenantId }
// Returns: { expiringToday, expiringThisWeek, expiringThisMonth, expiredUnrenewed }

GetContractTermsAsOfQuery { tenantId, profileId, asOfDate }
// Point-in-time query: what were this person's terms on a specific date?
```

### Jurisdiction validation (called during create/renew)

- Check max consecutive fixed-term contracts (Vietnam: 2)
- Check probation duration (Vietnam: max 60 days)
- Check total fixed-term duration (Vietnam: max 36 months, then must convert)
- Warn (not block) — HR can override with documented reason

## Edge Cases

- **Concurrent amendments:** Two HR users amending the same contract simultaneously. Use optimistic locking (version_number check on update).
- **Amend a terminated contract:** Not allowed. Must create a new contract (rehire flow).
- **Extend an indefinite contract:** Not meaningful (no end_date). Block with clear error.
- **Backdated amendment:** `effectiveDate` in the past. Allow for corrections but flag in audit log.
- **Terms snapshot construction:** When creating a version, build terms JSONB from current profile + contract data. If source data changes later, the snapshot is preserved.
- **Vietnam 36-month rule:** Sum total duration of consecutive fixed-term contracts. If exceeding 36 months, warn that conversion to indefinite is required.

## Acceptance Criteria

- [ ] Create initial contract version command handler
- [ ] Submit for approval command handler
- [ ] Activate contract with supersede-previous logic
- [ ] Amend contract creates new version with changed_fields + terms snapshot
- [ ] Extend contract creates new version with updated end_date
- [ ] Terminate contract with reason taxonomy
- [ ] Jurisdiction validation (Vietnam rules) with override capability
- [ ] List contract versions query (full version chain)
- [ ] List all contracts query (paginated, filtered)
- [ ] Contract expiry stats query
- [ ] Point-in-time terms query (as-of date)
- [ ] Link document to contract version
- [ ] Domain events emitted for all lifecycle transitions
- [ ] tRPC procedures for all operations
- [ ] Unit tests for each status transition (valid + invalid)
- [ ] Unit tests for jurisdiction validation
- [ ] Integration test for full lifecycle: create → approve → activate → amend → extend → expire
