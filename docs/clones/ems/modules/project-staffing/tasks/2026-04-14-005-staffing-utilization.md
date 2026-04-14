---
module: project-staffing
task: staffing-utilization
created: 2026-04-14
priority: medium
depends-on: [001]
---

# Task: Staffing Analytics & Utilization

## Scope

Complete the existing staffing analytics queries (currently return empty arrays) and add utilization reporting:

1. Wire `PeopleQueryFacade.listActiveActors()` into staffing overview and capacity report
2. Implement utilization calculation (confirmed hours / standard hours)
3. Categorize people: bench, available, normal, over-allocated

## Roles Covered

- **HR / SUPER_ADMIN:** View full staffing analytics across org
- **EXECUTIVE:** View staffing analytics (read-only)
- **ACCOUNT_MANAGER:** View staffing for their accounts

## Business Context

The staffing overview and capacity report queries already exist in the target but return empty arrays because they depend on `PeopleQueryFacade.listActiveActors()`. These are critical for resource managers to see the big picture: who's allocated, who's free, who's overbooked.

Utilization (billable hours / available hours) is the #1 financial metric for consulting firms. Target utilization is typically 65-80% depending on role.

## Source Reference

- **Files:** `src/repository/effort_repository.py` (basic effort queries), `src/core/services/project_service.py`
- **Key logic:** Legacy has basic effort % listing. Target already has better query designs — just needs implementation.

## Target Location

- **Where:** `apps/api/src/modules/projects/application/queries/get-staffing-overview.handler.ts`, `get-capacity-report.handler.ts`
- **Conventions to follow:** Existing query handler pattern, PeopleQueryFacade integration

## Data Model

No new tables. Queries existing `allocation` table + `PeopleQueryFacade` for active actors.

## Interface Contract

### PeopleQueryFacade methods needed (must be exposed by people module)

- `listActiveActors(tenantId)` — returns all active employment profiles with basic info
- `getStandardHoursForActor(actorId, tenantId)` — returns standard work hours (default 8h/day)

### Staffing Overview (complete existing handler)

Already defined in target. Implementation:

1. Call `PeopleQueryFacade.listActiveActors(tenantId)`
2. For each actor, call `allocRepo.sumConfirmedHoursPerDay(actorId, tenantId, startDate, endDate)`
3. Calculate utilization: `confirmedHoursPerDay / standardHoursPerDay * 100`
4. Return entries with actorId, confirmedHoursPerDay, standardHoursPerDay, utilizationPercent

### Capacity Report (complete existing handler)

Already defined in target. Implementation:

1. Same data as staffing overview
2. Categorize each actor:
   - `bench`: utilization < 20%
   - `available`: 20% <= utilization < 80%
   - `normal`: 80% <= utilization <= 100%
   - `over_allocated`: utilization > 100%
3. Return entries grouped: `{ entries, bench, overAllocated }`

### New: Utilization Summary

- `GetUtilizationSummaryQuery { tenantId, startDate, endDate, groupBy: 'person' | 'department' | 'account' }`

Response:

```typescript
{
  overall: { avgUtilization: number, totalCapacityHours: number, totalAllocatedHours: number }
  entries: {
    groupKey: string  // actorId, departmentId, or accountId
    groupName: string
    totalCapacityHours: number
    billableHours: number
    nonBillableHours: number
    utilizationPercent: number
    billableUtilization: number  // billable / capacity
  }[]
}
```

### tRPC procedures

- Existing `projects.getStaffingOverview` — complete implementation
- Existing `projects.getCapacityReport` — complete implementation
- New `projects.getUtilizationSummary`

## Edge Cases

- **No active actors:** Return empty entries, not error
- **Person with no allocations:** Appears in capacity report as `bench` (0% utilization)
- **Person allocated to multiple projects:** Sum all confirmed allocations for total hours
- **Terminated employees:** Exclude from staffing overview (only active actors)
- **Date range spanning future:** Future allocations count if their startedAt falls within range
- **Standard hours not configured:** Default 8h/day. Log warning if PeopleQueryFacade doesn't provide it.

## Acceptance Criteria

- [ ] Staffing overview returns real data (not empty arrays)
- [ ] Capacity report categorizes people correctly (bench/available/normal/over_allocated)
- [ ] Utilization summary with groupBy support (person, department, account)
- [ ] Billable vs non-billable breakdown in utilization
- [ ] PeopleQueryFacade integration for active actors
- [ ] Default standard hours (8h) with fallback
- [ ] tRPC procedures updated/added
- [ ] Unit tests for utilization calculation
- [ ] Unit tests for categorization thresholds
- [ ] Integration test with mock PeopleQueryFacade
