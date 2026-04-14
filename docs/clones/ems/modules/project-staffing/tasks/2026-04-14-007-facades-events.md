---
module: project-staffing
task: facades-events
created: 2026-04-14
priority: medium
depends-on: [001, 003]
---

# Task: Cross-Module Facades & Events

## Scope

Expose ProjectsQueryFacade methods for consumption by other modules (time, finance, planner) and define new domain events for cross-module reactions.

## Roles Covered

- No direct role interaction — infrastructure for cross-module integration

## Business Context

The projects module is a hub that other modules need to read from:

- `time` module needs to know which projects a person works on (for timesheet project selection)
- `finance` module needs project type and team data (for billing and rate cards)
- `planner` module needs project context (for task organization)
- `notifications` module needs to react to project lifecycle events

Currently `ProjectsQueryFacade` only exposes `getPersonAllocations`, `getAccountStaffing`, and `sumConfirmedHoursForActor`. It needs more methods.

## Source Reference

- **Files:** `apps/api/src/modules/projects/application/facades/projects-query.facade.ts` (existing facade)
- **Key logic:** Existing facade has 3 methods. Needs expansion for cross-module integration.

## Target Location

- **Where:** `apps/api/src/modules/projects/application/facades/`, `packages/event-contracts/src/projects/`
- **Conventions to follow:** Facade pattern (only exported class), event contracts as plain TS classes

## Data Model

No new tables. Facade wraps existing repositories. Events are published via outbox.

## Interface Contract

### New ProjectsQueryFacade Methods

```typescript
// Existing (keep):
getPersonAllocations(actorId, tenantId): Promise<Allocation[]>
getAccountStaffing(accountId, tenantId): Promise<{account, allocations}>
sumConfirmedHoursForActor(actorId, tenantId, start, end): Promise<number>

// New:
getActiveProjectsForPerson(actorId, tenantId): Promise<{projectId, projectName, projectCode, accountName, role: string}[]>
  // Used by time module for timesheet project selector

getProjectMembers(projectId, tenantId): Promise<ProjectMember[]>
  // Used by finance for rate card lookups, notifications for project team

getProjectType(projectId, tenantId): Promise<{projectType, currency, estimatedValue}>
  // Used by finance to determine billing method

getProjectManagerForProject(projectId, tenantId): Promise<string | null>
  // Used by time for timesheet approval routing

listOpenProjectRoles(tenantId): Promise<{projectRoleId, projectName, roleName, skillsRequired, headcount}[]>
  // Used by hiring module to see unfilled demand
```

### New Domain Events

```typescript
// Project lifecycle
ProjectCreatedEvent { tenantId, projectId, accountId, projectType, projectManagerId }
ProjectArchivedEvent { tenantId, projectId, accountId }

// Team changes
ProjectMemberAddedEvent { tenantId, projectId, actorId, projectRole }
ProjectMemberRemovedEvent { tenantId, projectId, actorId }

// Allocation lifecycle (enhance existing)
AllocationProposedEvent { tenantId, allocationId, actorId, projectId, projectRoleId, hoursPerDay }
AllocationClosedEvent { tenantId, allocationId, actorId, projectId, endedAt }
  // Consumed by time module to stop pre-populating timesheets

// Demand
ProjectRoleOpenedEvent { tenantId, projectRoleId, projectId, roleName, skillsRequired }
  // Consumed by hiring module to consider creating requisitions
```

### Event Integration Map

| Event                      | Emitted By                        | Consumed By                                                    |
| -------------------------- | --------------------------------- | -------------------------------------------------------------- |
| `ProjectCreatedEvent`      | create-project handler            | notifications (inform stakeholders)                            |
| `ProjectArchivedEvent`     | archive-project handler           | time (remove from timesheet selector), finance (close billing) |
| `AllocationConfirmedEvent` | confirm-allocation (existing)     | time (pre-populate timesheets)                                 |
| `AllocationProposedEvent`  | create-allocation (proposed)      | notifications (inform resource manager)                        |
| `AllocationClosedEvent`    | close-allocation, archive-project | time (stop timesheet pre-population)                           |
| `ProjectMemberAddedEvent`  | add-member handler                | notifications (welcome to project)                             |
| `ProjectRoleOpenedEvent`   | create-project-role               | hiring (potential requisition trigger)                         |

## Edge Cases

- **Facade method failure:** If PeopleQueryFacade is unavailable, staffing queries should degrade gracefully (return partial data, not crash)
- **Event ordering:** Archive project emits multiple events (ProjectArchivedEvent + AllocationClosedEvent per allocation). Consumers must handle out-of-order delivery.
- **Stale facade data:** Facades return point-in-time snapshots. Consumers should not cache aggressively.
- **Facade circular dependency:** Projects depends on People facade, People depends on Projects facade (for allocation data). Use NestJS `forwardRef` or ensure facades are in separate provider registrations.

## Acceptance Criteria

- [ ] New facade methods implemented and exported
- [ ] All new event contracts defined in `@future/event-contracts`
- [ ] Events emitted from appropriate command handlers
- [ ] Existing `AllocationConfirmedEvent` still works (no regression)
- [ ] ProjectsQueryFacade exported from projects.module.ts
- [ ] Unit tests for each new facade method
- [ ] Event contracts have proper constructor validation
- [ ] Integration test: create project → verify ProjectCreatedEvent emitted
- [ ] Integration test: archive project → verify cascade events emitted
