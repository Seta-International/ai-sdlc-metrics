---
module: employee
task: probation-management
created: 2026-04-14
priority: medium
depends-on: [002]
---

# Task: Probation Management

## Scope

Track employee probation periods with automated reminders and outcome recording. Manager receives reminders before probation ends and must record a decision: confirm, extend, or terminate.

## Roles Covered

- **HR:** Set probation period on hire, view probation dashboard, override outcomes
- **MANAGER:** Receive reminders, record probation outcome (confirm/extend/terminate)

## Business Context

Standard HRM feature. Probation periods are legally significant in many jurisdictions (Vietnam: 60 days for most roles). Missing a probation review can have legal consequences. Automated reminders prevent this.

## Source Reference

- **Files:** `src/core/services/system_settings_service.py` (contract reminder scheduling — similar pattern)
- **Key logic:** Legacy has no probation management. Contract module has reminder scheduling via APScheduler — same pattern applies here via pg-boss.

## Target Location

- **Where:** `apps/api/src/modules/people/application/commands/`, `apps/api/src/modules/people/domain/`
- **Conventions to follow:** pg-boss for scheduled jobs, domain events for notifications

## Data Model

Uses existing `employment_profile.probationEndDate` (from `contract_version`) or add to `employment_profile` directly.

New fields on `employment_profile` (or a dedicated table if probation gets complex):

- `probation_end_date date`
- `probation_status text` — `in_probation`, `confirmed`, `extended`, `terminated`
- `probation_outcome_date date`
- `probation_outcome_by uuid`
- `probation_note text`

## Interface Contract

Commands:

- `SetProbationCommand { profileId, endDate }` — set/update probation end date
- `ConfirmProbationCommand { profileId, note?, confirmedBy }`
- `ExtendProbationCommand { profileId, newEndDate, reason, extendedBy }`
- `TerminateDuringProbationCommand { profileId, reason, terminatedBy }` — triggers offboarding

pg-boss jobs:

- `probation-reminder` — scheduled at hire, fires 30/14/7 days before probation_end_date
- Emits `ProbationEndingEvent { tenantId, profileId, managerId, endDate, daysRemaining }`

Queries:

- `ListProbationaryEmployeesQuery { tenantId, endingBefore? }` — dashboard for HR

## Edge Cases

- Probation extended: reschedule reminder jobs for new end date
- Employee terminated during probation: cancel reminder jobs
- No manager assigned: reminder goes to HR
- Probation end date passed without outcome: escalate to HR with "overdue" flag

## Acceptance Criteria

- [ ] Probation fields on employment_profile (or dedicated table)
- [ ] Command handlers for confirm/extend/terminate
- [ ] pg-boss reminder job scheduled at probation set
- [ ] Reminder fires at 30/14/7 days before end
- [ ] `ProbationEndingEvent` emitted for notifications module
- [ ] Probation dashboard query for HR
- [ ] Auto-escalation if outcome overdue
- [ ] tRPC procedures for all operations
- [ ] Unit tests for each outcome path
- [ ] Integration test for reminder scheduling and firing
