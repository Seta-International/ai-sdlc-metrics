---
module: project-staffing
task: resource-matching
created: 2026-04-14
priority: high
depends-on: [001, 003, 005]
---

# Task: Resource Matching & Demand Planning

## Scope

Implement skills-based resource matching and availability-aware demand planning:

1. Find candidates for open ProjectRoles by matching `skillsRequired` against employee skills from `people` module
2. Rank candidates by skills fit + availability
3. Allocation conflict detection — warn when person exceeds standard hours
4. Bench query — find people with no/low allocations

## Roles Covered

- **HR / SUPER_ADMIN:** Search for candidates across entire org, view bench
- **ACCOUNT_MANAGER:** Search for candidates for projects in their account
- **PROJECT_MANAGER:** Search for candidates for roles on their project

## Business Context

"Who should we put on this project?" is the core question of resource management. The legacy system has no answer — you manually browse employees and assign them. Every PSA (Kantata, Float, Runn, Productive.io) has skills-based matching as their #1 feature. It's what makes a staffing tool into a resource planning system.

The bench report ("who's idle?") is the #1 report resource managers want. Idle people cost money. This query drives staffing decisions and hiring plans.

## Source Reference

- **Files:** `src/core/services/employee_service.py` (search_employees — basic name/email search, no skills matching), `src/repository/effort_repository.py` (effort % queries)
- **Key logic:** Legacy has no skills matching. Effort tracking is basic sum of allocation percentages.

## Target Location

- **Where:** `apps/api/src/modules/projects/application/queries/`
- **Conventions to follow:** Cross-module reads via `PeopleQueryFacade`

## Data Model

No new tables. Queries across:

- `projects.project_role` (demand: skillsRequired[], headcount, status)
- `projects.allocation` (supply: actorId, hoursPerDay, startedAt, endedAt, status)
- `people.profile_section` via `PeopleQueryFacade` (skills data)

## Interface Contract

### Resource Matching

- `FindCandidatesQuery { projectRoleId, tenantId, limit? }` — returns ranked candidates

Response per candidate:

```typescript
{
  actorId: string
  displayName: string
  jobTitle: string
  department: string
  skillsMatch: { skill: string, hasSkill: boolean }[]  // per required skill
  matchScore: number          // 0-100, based on skills overlap
  availableHoursPerDay: number  // capacity - existing allocations in the role's date range
  currentUtilization: number  // % of standard hours already allocated
  currentAllocations: { projectName: string, hoursPerDay: number }[]
}
```

Matching algorithm:

1. Get required skills from ProjectRole
2. Query PeopleQueryFacade for people with matching skills
3. Calculate availability for each candidate (standard hours - sum of confirmed allocations in date range)
4. Rank by: skills match % (60 weight) × availability % (40 weight)
5. Filter out people with 0 availability unless explicitly requested

### Bench Report

- `GetBenchReportQuery { tenantId, startDate, endDate, threshold? }` — people below utilization threshold

Response:

```typescript
{
  benchEntries: {
    actorId: string
    displayName: string
    department: string
    confirmedHoursPerDay: number
    standardHoursPerDay: number  // default 8, configurable
    utilizationPercent: number
    skills: string[]
    availableSince: Date  // when their last allocation ended (or hire date if never allocated)
  }[]
  totalBenchCount: number
  totalBenchHoursPerDay: number  // aggregate idle capacity
}
```

Default threshold: people below 20% utilization are "on bench."

### Allocation Conflict Detection

- `CheckAllocationConflictQuery { actorId, tenantId, hoursPerDay, startDate, endDate }` — returns conflict info

Response:

```typescript
{
  hasConflict: boolean
  totalHoursAfterAllocation: number
  standardHours: number  // 8h default
  existingAllocations: { projectName: string, hoursPerDay: number }[]
  overageHoursPerDay: number  // how much over standard (0 if no conflict)
}
```

Called before creating/updating an allocation. Returns advisory warning, doesn't block.

### tRPC procedures

- `projects.findCandidates` (query)
- `projects.getBenchReport` (query)
- `projects.checkAllocationConflict` (query)

## Edge Cases

- **No skills data:** If an employee has no skills in their profile, they still appear with matchScore=0 but sorted last. Don't exclude them — they might be suitable.
- **Proposed allocations:** Don't count proposed allocations against availability. Only tentative + confirmed reduce capacity.
- **Cross-project visibility:** Resource matching shows candidates from across all projects. Access control applies to viewing allocation details, not to candidate visibility.
- **Standard hours:** Default 8h/day. Future: configurable per person (from time module work schedule) or per tenant.
- **Date range for bench:** "Bench now" uses today. "Bench next month" uses future date range. Availability is time-dependent.
- **Skills matching quality:** Initial version uses string equality on skill names. Future: fuzzy matching, skill categories, proficiency levels.

## Acceptance Criteria

- [ ] `FindCandidatesQuery` returns ranked candidates by skills fit + availability
- [ ] Skills matching queries PeopleQueryFacade for employee skills
- [ ] Availability calculated from existing confirmed+tentative allocations
- [ ] `GetBenchReportQuery` returns people below utilization threshold
- [ ] `CheckAllocationConflictQuery` detects over-allocation
- [ ] Proposed allocations excluded from availability calculations
- [ ] tRPC procedures for all queries
- [ ] Unit tests for matching algorithm (various skill overlap scenarios)
- [ ] Unit tests for availability calculation (concurrent allocations)
- [ ] Unit tests for bench report (threshold filtering)
- [ ] Integration test for full flow: create role with skills → find candidates → check conflict → create allocation
