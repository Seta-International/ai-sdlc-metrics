---
module: contract
task: expiry-renewal
created: 2026-04-14
priority: medium
depends-on: [002]
---

# Task: Expiry Scanning + Renewal Flow

## Scope

Implement automated contract expiry detection and renewal initiation:

1. pg-boss daily scanner job — finds contracts approaching expiry, emits events
2. Configurable alert thresholds per tenant (default: 90, 60, 30, 14, 7 days)
3. Renewal initiation — create new contract version from expired/expiring one
4. Evaluation trigger — emit event at 90 days for performance module

## Roles Covered

- **HR:** Configure alert thresholds, initiate renewals, view expiring contracts
- **MANAGER:** Receive notifications about direct reports' expiring contracts

## Business Context

Missing a contract renewal deadline has legal consequences — an employee working past contract end without renewal may be considered permanent by default (Vietnam law). Automated scanning prevents this. The legacy system scans for expiring contracts and creates evaluation tasks for handlers.

## Source Reference

- **Files:** `src/core/services/contract_service.py` (scan_expiring_contracts, \_schedule_evaluation_reminder)
- **Key logic:** Legacy uses APScheduler periodic job to scan active contracts within `CONTRACT_REMINDER_DAYS` of expiry. Updates status to EXPIRING, creates tasks for evaluation leaders.

## Target Location

- **Where:** `apps/api/src/modules/people/application/commands/`, pg-boss job definitions
- **Conventions to follow:** pg-boss for scheduled jobs, domain events for notifications

## Data Model

Alert configuration (can be tenant-level in admin or people module):

```
people.contract_alert_config
  id              uuid PK
  tenant_id       uuid NOT NULL UNIQUE
  alert_thresholds  integer[] DEFAULT '{90,60,30,14,7}'  -- days before expiry
  evaluation_trigger_days  integer DEFAULT 90  -- when to request pre-renewal evaluation
  created_at      timestamptz DEFAULT now()
  updated_at      timestamptz DEFAULT now()
```

## Interface Contract

### pg-boss Jobs

`contract-expiry-scanner` — runs daily at 01:00 UTC:

1. Query all active contracts where `ended_at IS NOT NULL`
2. For each, compute `days_remaining = ended_at - current_date`
3. If `days_remaining` matches any alert threshold AND no event emitted for this threshold yet:
   - Emit `ContractExpiringSoonEvent { tenantId, contractVersionId, profileId, endDate, daysRemaining }`
4. If `days_remaining` matches `evaluation_trigger_days`:
   - Emit `ContractRenewalEvaluationRequested` (consumed by performance module)
5. If `days_remaining <= 0` and status is still `active`:
   - Update status to `expired`
   - Emit `ContractExpiredEvent`

Dedup mechanism: track emitted alerts in a JSONB column or separate `contract_alert_log` table to avoid duplicate notifications.

### Commands

```typescript
RenewContractCommand { tenantId, profileId, contractTypeId, startedAt, endedAt?, terms }
// Creates a new contract version with change_type='renewal', links to previous via previous_version_id
// Previous active version → expired (if not already)

ConfigureAlertThresholdsCommand { tenantId, thresholds: number[], evaluationTriggerDays: number }
```

### Queries

```typescript
ListExpiringContractsQuery { tenantId, expiringWithinDays: number }
// Returns contracts expiring within N days, ordered by end_date asc
```

## Edge Cases

- **Time zones:** Scanner runs in UTC. `ended_at` is date (not timestamp). Use tenant timezone for "today" calculation.
- **Already renewed:** If a contract has been renewed (new version with change_type='renewal' exists), don't emit expiry alerts for the old version.
- **Manual trigger:** HR can manually trigger the scanner (for testing or after configuration change).
- **Evaluation already completed:** If performance module has already completed evaluation, don't re-request. Check via event history or a flag.
- **Auto-renewal (v2):** Deferred. When implemented, the scanner would auto-create renewal versions for contracts with auto_renewal enabled and no opt-out received.

## Acceptance Criteria

- [ ] pg-boss daily scanner job registered and executing
- [ ] Scanner finds contracts at configured threshold days
- [ ] `ContractExpiringSoonEvent` emitted with dedup (no duplicate alerts)
- [ ] `ContractRenewalEvaluationRequested` emitted at evaluation trigger days
- [ ] `ContractExpiredEvent` emitted and status updated for past-due contracts
- [ ] Renewal command creates new version chain
- [ ] Alert threshold configuration per tenant
- [ ] Manual scanner trigger endpoint
- [ ] tRPC procedures for config and expiring contracts list
- [ ] Unit tests for scanner logic (various days_remaining scenarios)
- [ ] Unit tests for dedup mechanism
- [ ] Integration test for scanner → event emission → renewal flow
