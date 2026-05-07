# Plan 2 — ListOnboardingCasesQuery + `listCases` tRPC Route

**Spec:** `docs/superpowers/specs/2026-05-04-onboarding-design.md`
**Depends on:** Plan 1 (needs `findAllActive`, `getTaskAggregates`, `findManyByIds` on repos)
**Blocks:** Plan 4 (frontend Kanban fetches `listCases`)

---

## Goal

Build the query handler that powers the Kanban board — returns all `in_progress` onboarding cases
enriched with employee name, job title, department, start date, stage, task counts, and blocker
count. Wire it into the tRPC router.

---

## Steps

### 2.1 — Query class

**File:** `apps/api/src/modules/people/application/queries/list-onboarding-cases.query.ts`

```ts
export class ListOnboardingCasesQuery {
  constructor(public readonly tenantId: string) {}
}
```

---

### 2.2 — DTO type

In the same file, export:

```ts
import type { OnboardingCaseStage } from '../../domain/entities/onboarding-case.entity'

export interface OnboardingCaseListItem {
  id: string
  employmentId: string
  employeeName: string
  jobTitle: string
  department: string
  avatarUrl: string | null
  startDate: string // ISO date string (YYYY-MM-DD)
  stage: OnboardingCaseStage
  tasksTotal: number
  tasksCompleted: number
  blockers: number
}
```

---

### 2.3 — Handler

**File:** `apps/api/src/modules/people/application/queries/list-onboarding-cases.handler.ts`

Decorate with `@QueryHandler(ListOnboardingCasesQuery)`.
Implement `IQueryHandler<ListOnboardingCasesQuery, OnboardingCaseListItem[]>`.

Inject:

- `@Inject(ONBOARDING_CASE_REPOSITORY) private readonly caseRepo: IOnboardingCaseRepository`
- `@Inject(EMPLOYMENT_REPOSITORY) private readonly employmentRepo: IEmploymentRepository`
- `@Inject(PERSON_PROFILE_REPOSITORY) private readonly profileRepo: IPersonProfileRepository`

`execute` body — all DB calls sequential (no `Promise.all`):

1. `const cases = await this.caseRepo.findAllActive(tenantId)` — if empty return `[]`
2. `const caseIds = cases.map(c => c.id)`
3. `const aggregates = await this.caseRepo.getTaskAggregates(caseIds, tenantId)`
4. `const employmentIds = cases.map(c => c.employmentId)`
5. `const employments = await this.employmentRepo.findManyByIds(employmentIds, tenantId)`
6. `const profileIds = employments.map(e => e.personProfileId)`
7. `const profiles = await this.profileRepo.findManyByIds(profileIds, tenantId)`
8. Build lookup maps: `empMap`, `profileMap`, `aggMap`
9. Map `cases` to `OnboardingCaseListItem[]`:
   - `employeeName = profile.givenName + ' ' + profile.familyName`
   - `startDate = emp.hireDate.toISOString().slice(0, 10)`
   - `jobTitle = emp.jobTitle ?? ''`
   - `department = emp.department ?? ''`
   - `avatarUrl = null` (wired in a later iteration)

> **Note:** If `jobTitle` / `department` live on `EmploymentDetail` rather than `Employment`,
> also inject `IEmploymentDetailRepository` and fetch detail rows sequentially in step 5b.
> Verify by checking the `Employment` entity before implementing.

---

### 2.4 — Register handler in `PeopleModule`

**File:** `apps/api/src/modules/people/people.module.ts`

- Import `ListOnboardingCasesHandler`
- Add to `providers` array near `ListOnboardingTasksHandler`

---

### 2.5 — tRPC route

**File:** `apps/api/src/modules/people/interface/trpc/people.router.ts`

Inside the existing `onboarding: router({...})` block, add alongside `getCase`:

```ts
listCases: publicProcedure
  .input(z.object({ tenantId: z.string().uuid() }))
  .query(({ input }) => svc().query(new ListOnboardingCasesQuery(input.tenantId))),
```

Add import at top of file:

```ts
import { ListOnboardingCasesQuery } from '../../../application/queries/list-onboarding-cases.query'
```

---

### 2.6 — Spec

**File:** `apps/api/src/modules/people/application/queries/list-onboarding-cases.handler.spec.ts`

Use the `vi.fn()` mock-repo pattern from `reset-staged-ms-user.handler.spec.ts`.

- **Test 1** — `returns empty array when no active cases exist`:
  `findAllActive` returns `[]`; assert output is `[]` and `findAllActive` was called with `TENANT_ID`.

- **Test 2** — `returns enriched list with correct counts and blockers`:
  Mock 1 case, 1 employment, 1 profile, aggregate `{ tasksTotal: 3, tasksCompleted: 1, blockers: 1 }`.
  Assert output contains correct `employeeName`, `stage`, `tasksTotal`, `blockers`.

- **Test 3** — `enforces tenant isolation`:
  Assert `findAllActive` is called with the correct `tenantId`.

---

## Risks

- `jobTitle` and `department` may live on `EmploymentDetail` — verify the `Employment` entity
  before implementing step 5.
- `avatarUrl` is `null` for now — a follow-up can wire photo storage once available.
