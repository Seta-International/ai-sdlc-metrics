---
module: employee
task: lifecycle-state-machine
created: 2026-04-14
priority: high
depends-on: [001]
---

# Task: Employment Lifecycle State Machine

## Scope

Implement guarded employment status transitions with event emission. Every transition is recorded as an immutable event. No arbitrary status updates — only valid transitions are allowed.

## Roles Covered

- **HR:** Trigger all transitions (activate, suspend, initiate termination, confirm rehire)
- **MANAGER:** View status of direct reports, receive notifications on transitions
- **EMPLOYEE:** View own status history

## Business Context

The legacy system allows arbitrary status changes (`Active`, `Inactive`, `Pending Approve`). Modern HRMs (BambooHR, HiBob, Personio) enforce a state machine where each transition has rules, reasons, and audit trail. This prevents invalid states (e.g., terminating someone who's already terminated) and ensures every module is notified of lifecycle changes.

## Source Reference

- **Files:** `src/core/enums/employee.py` (EmployeeStatusEnum), `src/core/services/employee_service.py` (status changes scattered across methods)
- **Key logic:** Legacy has 3 statuses with no transition guards. Target has 5 statuses (`pre_hire`, `active`, `on_leave`, `offboarding`, `terminated`) but no transition logic.

## Target Location

- **Where:** `apps/api/src/modules/people/domain/`, `apps/api/src/modules/people/application/commands/`
- **Conventions to follow:** CQRS command handlers, domain events via outbox, DDD value objects for state machine

## Data Model

No new tables. Uses existing `employment_profile.employmentStatus` enum + domain events via `core.outbox_event`.

State machine:

```
pre_hire ──activate──► active ◄──return──┐
                         │               │
                    leave_start      leave_end
                         │               │
                         ▼               │
                      on_leave ──────────┘
                         │
                    active ──terminate──► offboarding ──complete──► terminated
                                                                       │
                                                                   rehire
                                                                       │
                                                                       ▼
                                                                   pre_hire (new profile)
```

Valid transitions:

| From          | To            | Trigger              | Requires                                  |
| ------------- | ------------- | -------------------- | ----------------------------------------- |
| `pre_hire`    | `active`      | activate             | HR action, start_date reached             |
| `active`      | `on_leave`    | leave_start          | Leave request approved (from time module) |
| `on_leave`    | `active`      | return               | Leave end date reached                    |
| `active`      | `offboarding` | terminate            | HR initiates, reason required             |
| `offboarding` | `terminated`  | complete_offboarding | All offboarding tasks done                |
| `terminated`  | `pre_hire`    | rehire               | Creates NEW employment_profile            |

## Interface Contract

Commands:

- `ActivateEmploymentCommand { profileId, effectiveDate }`
- `StartLeaveCommand { profileId, effectiveDate, expectedReturnDate }`
- `ReturnFromLeaveCommand { profileId, effectiveDate }`
- `InitiateTerminationCommand { profileId, effectiveDate, reason, reasonCategory }`
- `CompleteTerminationCommand { profileId }` (already exists as complete-offboarding)
- `RehireCommand { actorId, previousProfileId, hireDate, ... }`

Domain events emitted:

- `EmployeeActivatedEvent { tenantId, actorId, profileId, effectiveDate }`
- `LeaveStartedEvent { tenantId, actorId, profileId, expectedReturnDate }`
- `LeaveEndedEvent { tenantId, actorId, profileId }`
- `TerminationInitiatedEvent { tenantId, actorId, profileId, reason, lastDay }`
- `EmployeeTerminatedEvent { tenantId, actorId, profileId }` (already exists)
- `EmployeeRehiredEvent { tenantId, actorId, newProfileId, previousProfileId }`

## Edge Cases

- Attempting an invalid transition (e.g., `terminated` → `active`) must throw a domain error with clear message
- Rehire creates a NEW `employment_profile` with `previousProfileId` pointing to the old one. The old profile stays `terminated`.
- `on_leave` → `offboarding` is valid (can terminate someone on leave)
- Future-dated transitions: `effectiveDate` can be in the future. A pg-boss job should auto-execute when the date arrives.
- Bulk transitions: handled by task 009, not here

## Acceptance Criteria

- [ ] `EmploymentStatus` value object with transition validation (throws on invalid transition)
- [ ] Command handler for each transition with proper authorization
- [ ] Domain events emitted for every transition via outbox
- [ ] Event contracts added to `@future/event-contracts` for new events
- [ ] Rehire creates new profile linked via `previousProfileId`
- [ ] tRPC procedures for all transition commands
- [ ] Unit tests for every valid transition
- [ ] Unit tests for every invalid transition (must reject)
- [ ] Integration test for rehire flow (new profile, old profile stays terminated)
