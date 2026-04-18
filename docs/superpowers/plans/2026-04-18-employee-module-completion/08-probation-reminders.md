# Plan 08 — Task 007 Closure (Probation — Router Wiring + Reminder Job)

> Covers spec §5 row "Task 007-probation-management". No schema dependency.

**Goal:** Wire the already-implemented `SetProbationHandler` into the tRPC router; add `ListProbationaryEmployeesQuery`; add `probation-reminder.job.ts` scheduling reminders at 30/14/7 days before probation end.

---

## File Map

| File                                                                                             | Action | Purpose                                                                 |
| ------------------------------------------------------------------------------------------------ | ------ | ----------------------------------------------------------------------- |
| `apps/api/src/modules/people/interface/trpc/people.router.ts`                                    | Modify | Add `probation.set` + `probation.listProbationary`                      |
| `apps/api/src/modules/people/application/queries/list-probationary-employees.query.ts`           | Create | Query DTO                                                               |
| `apps/api/src/modules/people/application/queries/list-probationary-employees.handler.ts`         | Create | Handler                                                                 |
| `apps/api/src/modules/people/application/queries/list-probationary-employees.handler.spec.ts`    | Create | Unit test                                                               |
| `apps/api/src/modules/people/domain/repositories/probation-record.repository.ts`                 | Modify | Add `listActiveEndingBefore`                                            |
| `apps/api/src/modules/people/infrastructure/repositories/probation-record.repository.ts`         | Modify | Implement new method                                                    |
| `apps/api/src/modules/people/infrastructure/jobs/probation-reminder.job.ts`                      | Create | pg-boss handler                                                         |
| `apps/api/src/modules/people/infrastructure/jobs/probation-reminder.job.spec.ts`                 | Create | Unit test                                                               |
| `apps/api/src/modules/people/application/event-handlers/schedule-probation-reminders.handler.ts` | Create | Listens to `ProbationSetEvent`, schedules pg-boss jobs at T-30/T-14/T-7 |
| `apps/api/src/modules/people/people.module.ts`                                                   | Modify | Register new query/job/event handlers                                   |
| `docs/clones/ems/PROGRESS.md`                                                                    | Modify | Flip task 007 to `done`                                                 |

---

## Task 1 — Wire `probation.set` tRPC procedure

- [ ] **Step 1:** Read `people.router.ts`. Find existing probation procedures (`confirmProbation`, `extendProbation`, `failProbation` — per the audit). The `SetProbationHandler` exists but no procedure calls it.

- [ ] **Step 2:** Add procedure mirroring the command signature. Permission: `people.probation.set` (add to kernel permissions seed if missing).

- [ ] **Step 3:** Router spec: happy-path test.

- [ ] **Step 4:** Run → PASS. Commit.

---

## Task 2 — `ListProbationaryEmployeesQuery` (TDD)

- [ ] **Step 1:** Query DTO:

```ts
export class ListProbationaryEmployeesQuery {
  constructor(
    public readonly tenantId: string,
    public readonly endingWithinDays: number | null,
  ) {}
}
```

- [ ] **Step 2:** Extend `IProbationRecordRepository`:

```ts
listActive(tenantId: string, endingBefore?: Date): Promise<ProbationRecord[]>
```

- [ ] **Step 3:** Spec. Cover:
  - Returns active probation records (status = `in_progress` or similar).
  - `endingWithinDays` narrows to records with `probationEndDate < now + N days`.
  - Sorted by `probationEndDate` ASC.

- [ ] **Step 4:** Implement repo method, then handler. Sequential DB calls.

- [ ] **Step 5:** Run → PASS. Commit.

---

## Task 3 — `probation-reminder.job.ts` (TDD)

**Files:**

- Create: job + spec

- [ ] **Step 1:** Look at `check-document-expiry.job.ts` + `apply-scheduled-changes.job.ts` for pg-boss handler shape.

- [ ] **Step 2:** Spec. Cover:
  - Job receives payload `{ probationRecordId, tenantId, daysOut }`.
  - Fetches the probation record. If status is no longer `in_progress`, no-op.
  - Emits `ProbationReminderDueEvent` via outbox with `daysOut` (30/14/7).
  - Does not reschedule — scheduler schedules all three up-front when probation is set.

- [ ] **Step 3:** Implement:

```ts
import { Injectable } from '@nestjs/common'
import { JobHandler } from '@future/jobs' // or wherever the pg-boss abstraction lives — check existing jobs
// ...

@Injectable()
export class ProbationReminderJob {
  constructor(
    @Inject(PROBATION_RECORD_REPOSITORY)
    private readonly repo: IProbationRecordRepository,
    private readonly outbox: OutboxService,
  ) {}

  async handle(payload: { probationRecordId: string; tenantId: string; daysOut: 30 | 14 | 7 }) {
    const record = await this.repo.findById(payload.probationRecordId, payload.tenantId)
    if (!record || record.status !== 'in_progress') return
    await this.outbox.emit({
      eventType: 'people.probation.reminder-due',
      payload: {
        tenantId: payload.tenantId,
        probationRecordId: record.id,
        daysOut: payload.daysOut,
        occurredAt: new Date().toISOString(),
      },
    })
  }
}
```

- [ ] **Step 4:** Register in module + in pg-boss queue registration (follow existing job pattern).

- [ ] **Step 5:** Run → PASS. Commit.

---

## Task 4 — Schedule reminders on probation set

**Files:**

- Create: `schedule-probation-reminders.handler.ts` (event handler)

- [ ] **Step 1:** Listens to `ProbationSetEvent` (check existing event — look in `packages/event-contracts/src/people/`). If no such event exists, extend `SetProbationHandler` to emit one first.

- [ ] **Step 2:** Spec. Cover:
  - On event, schedules three pg-boss jobs at `probationEndDate - 30/14/7 days` respectively.
  - Jobs are identified by a deterministic key (e.g., `probation-reminder:<recordId>:30`) so re-subscription doesn't duplicate.

- [ ] **Step 3:** Implement using `pgBoss.send(name, data, { startAfter: date })` or `scheduleAt` per the repo's scheduler wrapper.

- [ ] **Step 4:** Run → PASS. Commit.

---

## Task 5 — `ListProbationaryEmployees` tRPC procedure

- [ ] **Step 1:** Add procedure. Input: `{ endingWithinDays?: number }`. Admin-only permission.

- [ ] **Step 2:** Router spec.

- [ ] **Step 3:** Run → PASS. Commit.

---

## Task 6 — PROGRESS.md + PR

- [ ] Flip row 007 to `done`. Open PR.

---

## Acceptance criteria

- `probation.set` tRPC procedure callable with permission check.
- `probation.listProbationary` returns active records optionally narrowed by ending window.
- Probation reminders scheduled at 30/14/7 days before probation end; job no-ops if record was confirmed/failed early.
- PROGRESS task 007 = `done`.
