---
module: contract
task: contract-schema
created: 2026-04-14
priority: high
depends-on: []
---

# Task: Contract Schema Evolution

## Scope

Enhance the existing `contract_version` table in the `people` schema and add supporting infrastructure for the full contract lifecycle. This is the foundation for tasks 002 and 003.

1. Enhance `contract_version` with version chain fields, terms snapshot, change tracking
2. Add contract-related event contracts to `@future/event-contracts`
3. Create/update domain entities and repository interfaces

## Roles Covered

- No direct role interaction — infrastructure

## Business Context

The target has a stub `contract_version` table with basic fields. Modern HRM contract management (Personio, Deel) requires: version chains (amendment/extension/renewal tracking), full terms snapshots for point-in-time queries, and change tracking for audit compliance. Vietnam labor law requires audit trail of all contract changes.

## Source Reference

- **Files:** `src/core/models/contract.py` (ContractVersion, ContractDocument entities)
- **Key logic:** Legacy has flat version model with status enum. No version chain, no terms snapshot, no change tracking.

## Target Location

- **Where:** `apps/api/src/modules/people/infrastructure/schema/people.schema.ts`, `packages/event-contracts/src/people/`
- **Conventions to follow:** UUID v7 PKs, tenant_id, camelCase columns, Drizzle pgTable

## Data Model

### Enhance: `contract_version` (already in people schema)

Add columns:

```
  version_number    integer NOT NULL DEFAULT 1
  change_type       text NOT NULL DEFAULT 'initial'  -- 'initial' | 'amendment' | 'extension' | 'renewal'
  previous_version_id  uuid               -- self-ref to prior version (NULL = first)
  contract_type_id  uuid                  -- soft ref to admin.contract_type (replaces inline text)
  terms             jsonb NOT NULL DEFAULT '{}'  -- full snapshot of all terms at this version
    -- { salary, currency, workSchedule, title, department, probationEndDate, noticePeriodDays, benefitsTier, allowances, ... }
  changed_fields    jsonb                 -- delta: { "salary": { "from": 5000000, "to": 6000000 } }
  change_reason     text                  -- why this version was created
  approved_by       uuid                  -- actor who approved
  approved_at       timestamptz
  document_id       uuid                  -- soft ref to documents.generated_document (linked after generation)
  updated_at        timestamptz DEFAULT now()
```

Keep existing columns: id, tenantId, profileId, contractType (text, keep for backward compat during migration), status, startedAt, endedAt, probationEndDate, note, createdAt.

### Status enum update

Current: `draft | active | expired | terminated`
Add: `pending_approval | superseded`

Full enum: `draft | pending_approval | active | expired | terminated | superseded`

- `pending_approval` — submitted for HR review before activation
- `superseded` — replaced by a newer version (amendment/extension created a new version)

`expiring` remains computed at query time (active + end_date within threshold), never stored.

### New event contracts

```typescript
// packages/event-contracts/src/people/
ContractCreatedEvent { tenantId, contractVersionId, profileId, contractType, startedAt, endedAt }
ContractActivatedEvent { tenantId, contractVersionId, profileId, activatedAt }
ContractAmendedEvent { tenantId, contractVersionId, profileId, changedFields, effectiveDate }
ContractExpiringSoonEvent { tenantId, contractVersionId, profileId, endDate, daysRemaining }
ContractExpiredEvent { tenantId, contractVersionId, profileId }
ContractTerminatedEvent { tenantId, contractVersionId, profileId, reason, effectiveDate }
ContractRenewalEvaluationRequested { tenantId, contractVersionId, profileId, managerId, evaluationDeadline }
```

## Interface Contract

Enhanced entity:

- `ContractVersion` entity with `createInitial()`, `createAmendment(previousVersion, changedFields)`, `createExtension(previousVersion, newEndDate)`, `createRenewal(previousVersion)`

Enhanced repository:

- `ContractVersionRepository.findLatestActive(profileId, tenantId)` — current active version
- `ContractVersionRepository.findVersionChain(profileId, tenantId)` — all versions ordered
- `ContractVersionRepository.findExpiringBefore(tenantId, date)` — for scanner job
- `ContractVersionRepository.countByTypeAndStatus(tenantId)` — for dashboard stats

## Edge Cases

- `previous_version_id` self-reference: first version has NULL, subsequent versions chain
- `terms` JSONB: must be populated on every version (snapshot, not delta). Use a mapper to build terms from contract + profile data
- `changed_fields` only populated for amendments/extensions, not initial versions
- `contract_type_id` is a soft reference to admin module — no FK constraint across schemas
- Keep existing `contractType` text field for backward compat during migration, populate both

## Acceptance Criteria

- [ ] `contract_version` table enhanced with new columns via Drizzle migration
- [ ] Status enum extended with `pending_approval` and `superseded`
- [ ] Domain entity updated with factory methods for each change type
- [ ] Repository interface enhanced with new query methods
- [ ] Drizzle repository implementation updated
- [ ] All event contracts defined in `@future/event-contracts`
- [ ] Migration runs cleanly against existing data (new columns nullable or defaulted)
- [ ] Unit tests for entity factory methods
