# Plan 1 — DB Schema, Domain & Repository Layer

**Spec:** `docs/superpowers/specs/2026-05-04-onboarding-design.md`
**Depends on:** nothing — start here
**Blocks:** Plan 2, Plan 3

---

## Goal

Add the `stage` column to the database, update all domain types, extend repository interfaces and
implementations, and squash the migration.

---

## Steps

### 1.1 — Drizzle schema

**File:** `apps/api/src/modules/people/infrastructure/schema/people.schema.ts`

Add to the `onboardingCase` table definition:

```ts
stage: text('stage', {
  enum: ['offer_accepted', 'paperwork', 'equipment', 'first_day_ready'],
}).notNull().default('offer_accepted'),
```

---

### 1.2 — Entity

**File:** `apps/api/src/modules/people/domain/entities/onboarding-case.entity.ts`

Add export:

```ts
export type OnboardingCaseStage = 'offer_accepted' | 'paperwork' | 'equipment' | 'first_day_ready'
```

Add field to `OnboardingCase` interface:

```ts
stage: OnboardingCaseStage
```

---

### 1.3 — Exceptions

**File:** `apps/api/src/modules/people/domain/exceptions/people.exceptions.ts`

Append two classes following the existing `DomainException` pattern:

```ts
export class OnboardingCaseAlreadyExistsException extends DomainException {
  readonly code = 'ONBOARDING_CASE_ALREADY_EXISTS'
  constructor(employmentId: string) {
    super(`Onboarding case already exists for employment: ${employmentId}`)
  }
}

export class NoOnboardingTemplateException extends DomainException {
  readonly code = 'NO_ONBOARDING_TEMPLATE'
  constructor(tenantId: string) {
    super(`No onboarding template found for tenant: ${tenantId}`)
  }
}
```

---

### 1.4 — `IOnboardingCaseRepository` interface

**File:** `apps/api/src/modules/people/domain/repositories/onboarding-case.repository.ts`

Add three new method signatures:

```ts
findAllActive(tenantId: string): Promise<OnboardingCase[]>

updateStage(id: string, tenantId: string, stage: OnboardingCaseStage): Promise<void>

getTaskAggregates(
  caseIds: string[],
  tenantId: string,
): Promise<
  Array<{ caseId: string; tasksTotal: number; tasksCompleted: number; blockers: number }>
>
```

`findAllActive` returns all cases where `status = 'in_progress'` for the tenant.
`getTaskAggregates` loads all tasks for the given `caseIds` in one query then aggregates
in-process — avoids N+1 queries and avoids `Promise.all` on DB calls.

---

### 1.5 — `IPersonProfileRepository` interface

**File:** `apps/api/src/modules/people/domain/repositories/person-profile.repository.ts`

Add:

```ts
findManyByIds(ids: string[], tenantId: string): Promise<PersonProfile[]>
```

---

### 1.6 — `DrizzleOnboardingCaseRepository` implementation

**File:** `apps/api/src/modules/people/infrastructure/repositories/drizzle-onboarding.repository.ts`

Add `inArray` to the `drizzle-orm` import (alongside existing `and`, `eq`).

Implement `findAllActive`:

```ts
async findAllActive(tenantId: string): Promise<OnboardingCase[]> {
  const rows = await this.db
    .select()
    .from(onboardingCase)
    .where(and(eq(onboardingCase.tenantId, tenantId), eq(onboardingCase.status, 'in_progress')))
  return rows as OnboardingCase[]
}
```

Implement `updateStage`:

```ts
async updateStage(id: string, tenantId: string, stage: OnboardingCaseStage): Promise<void> {
  await this.db
    .update(onboardingCase)
    .set({ stage, updatedAt: new Date() })
    .where(and(eq(onboardingCase.id, id), eq(onboardingCase.tenantId, tenantId)))
}
```

Implement `getTaskAggregates`:

```ts
async getTaskAggregates(caseIds: string[], tenantId: string) {
  if (caseIds.length === 0) return []
  const rows = await this.db
    .select({
      caseId: onboardingTask.caseId,
      status: onboardingTask.status,
      isRequired: onboardingTask.isRequired,
      dueDate: onboardingTask.dueDate,
    })
    .from(onboardingTask)
    .where(and(eq(onboardingTask.tenantId, tenantId), inArray(onboardingTask.caseId, caseIds)))

  const map = new Map<string, { tasksTotal: number; tasksCompleted: number; blockers: number }>()
  for (const caseId of caseIds) map.set(caseId, { tasksTotal: 0, tasksCompleted: 0, blockers: 0 })
  const now = new Date()
  for (const row of rows) {
    const agg = map.get(row.caseId)!
    agg.tasksTotal++
    if (row.status === 'completed') agg.tasksCompleted++
    if (row.status === 'pending' && row.isRequired && row.dueDate && row.dueDate < now)
      agg.blockers++
  }
  return Array.from(map.entries()).map(([caseId, agg]) => ({ caseId, ...agg }))
}
```

---

### 1.7 — `DrizzlePersonProfileRepository` implementation

**File:** `apps/api/src/modules/people/infrastructure/repositories/drizzle-person-profile.repository.ts`

Add `inArray` to the `drizzle-orm` import.

Implement `findManyByIds`:

```ts
async findManyByIds(ids: string[], tenantId: string): Promise<PersonProfile[]> {
  if (ids.length === 0) return []
  const rows = await this.db
    .select()
    .from(personProfile)
    .where(and(eq(personProfile.tenantId, tenantId), inArray(personProfile.id, ids)))
  return rows as PersonProfile[]
}
```

---

### 1.8 — Squash migration

```bash
cd apps/api
rm -rf src/db/migrations/*.sql src/db/migrations/meta
bun run db:generate --name initial
bun run db:down -v && bun run db:up && bun run db:migrate
```

---

### 1.9 — Tests

**File:** `apps/api/src/modules/people/infrastructure/repositories/drizzle-onboarding.repository.spec.ts`
(Create if it does not exist; extend if it does.)

Use the `vi.fn()` mock-DB chain pattern from `drizzle-ms-profile-sync-state.repository.spec.ts`.

Tests to write:

- `updateStage` — asserts `db.update` is called and chain ends with `set({ stage: 'paperwork', ... })`
- `getTaskAggregates` with empty array — returns `[]` without calling the DB
- `getTaskAggregates` — given 3 tasks (1 completed, 1 overdue required pending, 1 non-required
  pending) returns `{ tasksTotal: 3, tasksCompleted: 1, blockers: 1 }`
- `findAllActive` — asserts `db.select` called; returned rows mapped to `OnboardingCase[]`

**File:** `apps/api/src/modules/people/infrastructure/repositories/drizzle-person-profile.repository.spec.ts`
(Create if it does not exist.)

Tests to write:

- `findManyByIds` with empty array — returns `[]` without calling the DB
- `findManyByIds` — asserts `db.select` called with `inArray` condition; returns mapped rows

---

## Risks

Purely additive changes — no existing functionality is modified. The `insert` in `DrizzleOnboardingCaseRepository`
does not explicitly set `stage`, so it falls back to the DB default (`offer_accepted`). Plan 3
passes `stage` explicitly to make intent clear and avoid relying on the default.
