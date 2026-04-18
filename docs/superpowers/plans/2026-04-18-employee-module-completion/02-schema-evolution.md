# Plan 02 — Task 001 Closure (Schema Evolution Handlers)

> Covers spec §5 row "Task 001-schema-evolution". Depends on Plan 01.

**Goal:** Close the remaining pieces of `employee/001-schema-evolution` that Plan 01 did not cover: expose `job_history` reads and a single internal write method for other handlers to call, plus the `effective_to` closure helper.

**Architecture:** One query handler + one tRPC procedure for read-only profile history. No new command handlers — `job_history` writes happen inside other commands (hire, promotion, department transfer, termination, rehire) which are already implemented or ship in Plan 03. This plan adds an internal helper service the existing commands will call.

---

## File Map

| File                                                                                    | Action | Purpose                                                              |
| --------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------- |
| `apps/api/src/modules/people/application/services/job-history-recorder.service.ts`      | Create | Helper that existing commands call to record a history entry         |
| `apps/api/src/modules/people/application/services/job-history-recorder.service.spec.ts` | Create | Unit test                                                            |
| `apps/api/src/modules/people/application/queries/get-job-history.query.ts`              | Create | Query DTO                                                            |
| `apps/api/src/modules/people/application/queries/get-job-history.handler.ts`            | Create | Read `IJobHistoryRepository`, return entries                         |
| `apps/api/src/modules/people/application/queries/get-job-history.handler.spec.ts`       | Create | Unit test                                                            |
| `apps/api/src/modules/people/interface/trpc/people.router.ts`                           | Modify | Expose `directory.getJobHistory`                                     |
| `apps/api/src/modules/people/application/commands/bulk-update-department.handler.ts`    | Modify | After successful department transfer, record history entry           |
| `apps/api/src/modules/people/application/commands/activate-employment.handler.ts`       | Modify | On activation (hire), record history entry with `changeType: 'hire'` |
| `apps/api/src/modules/people/application/commands/complete-termination.handler.ts`      | Modify | On termination, close open history entry                             |
| `apps/api/src/modules/people/people.module.ts`                                          | Modify | Provide `JobHistoryRecorderService`                                  |
| `docs/clones/ems/PROGRESS.md`                                                           | Modify | Flip task 001 to `done`                                              |

---

## Task 1 — `JobHistoryRecorderService` (TDD)

**Files:**

- Create: `.../application/services/job-history-recorder.service.ts` + `.spec.ts`

- [ ] **Step 1:** Spec. Cover:
  - `recordHire(profileId, tenantId, { jobTitle, departmentId, managerProfileId, effectiveFrom, recordedBy })` — calls `recordChange` with `changeType: 'hire'`.
  - `recordDepartmentTransfer(...)` — calls `closeOpenEntry` then `recordChange` with `changeType: 'department_transfer'`. Both DB calls are sequential (no `Promise.all`).
  - `recordTermination(profileId, tenantId, effectiveTo)` — calls `closeOpenEntry` only.
  - `recordRehire(...)` — calls `recordChange` with `changeType: 'rehire'`.

- [ ] **Step 2:** Run spec → FAIL.

- [ ] **Step 3:** Implement:

```ts
import { Inject, Injectable } from '@nestjs/common'
import {
  JOB_HISTORY_REPOSITORY,
  type IJobHistoryRepository,
} from '../../domain/repositories/job-history.repository'
import type { JobHistoryChangeType } from '../../domain/entities/job-history-entry.entity'

export interface RecordChangeInput {
  profileId: string
  tenantId: string
  effectiveFrom: Date
  jobTitle: string | null
  departmentId: string | null
  managerProfileId: string | null
  changeReason: string | null
  recordedBy: string | null
}

@Injectable()
export class JobHistoryRecorderService {
  constructor(
    @Inject(JOB_HISTORY_REPOSITORY)
    private readonly repo: IJobHistoryRepository,
  ) {}

  async recordHire(input: RecordChangeInput) {
    return this.record(input, 'hire')
  }

  async recordDepartmentTransfer(input: RecordChangeInput) {
    await this.repo.closeOpenEntry(input.profileId, input.tenantId, input.effectiveFrom)
    return this.record(input, 'department_transfer')
  }

  async recordPromotion(input: RecordChangeInput) {
    await this.repo.closeOpenEntry(input.profileId, input.tenantId, input.effectiveFrom)
    return this.record(input, 'promotion')
  }

  async recordManagerChange(input: RecordChangeInput) {
    await this.repo.closeOpenEntry(input.profileId, input.tenantId, input.effectiveFrom)
    return this.record(input, 'manager_change')
  }

  async recordTermination(profileId: string, tenantId: string, effectiveTo: Date) {
    await this.repo.closeOpenEntry(profileId, tenantId, effectiveTo)
  }

  async recordRehire(input: RecordChangeInput) {
    return this.record(input, 'rehire')
  }

  private async record(input: RecordChangeInput, changeType: JobHistoryChangeType) {
    return this.repo.recordChange({
      tenantId: input.tenantId,
      profileId: input.profileId,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: null,
      jobTitle: input.jobTitle,
      departmentId: input.departmentId,
      managerProfileId: input.managerProfileId,
      changeType,
      changeReason: input.changeReason,
      recordedBy: input.recordedBy,
    })
  }
}
```

- [ ] **Step 4:** Run spec → PASS.

- [ ] **Step 5:** Provide `JobHistoryRecorderService` in `people.module.ts` (class provider, no symbol needed — service is injected directly).

- [ ] **Step 6:** Commit.

```bash
git add apps/api/src/modules/people/application/services/job-history-recorder.service.* apps/api/src/modules/people/people.module.ts
git commit -m "feat(people): JobHistoryRecorderService"
```

---

## Task 2 — Wire recorder into existing commands (TDD)

For each of `activate-employment.handler.ts`, `bulk-update-department.handler.ts`, `complete-termination.handler.ts`:

- [ ] **Step 1:** Extend the handler's spec. Assert the recorder method is called with the correct arguments after the primary write succeeds. Mock the recorder.

- [ ] **Step 2:** Run spec → FAIL.

- [ ] **Step 3:** Inject `JobHistoryRecorderService` into the handler; call the appropriate method after the primary repo call returns. Sequential `await` only.

Example for `bulk-update-department.handler.ts` — after the `insert`, loop over `employmentIds` sequentially and call `recorder.recordDepartmentTransfer(...)` per employment. Fetch profile+manager info from existing repos, one employment at a time (no `Promise.all` on DB calls).

- [ ] **Step 4:** Run spec → PASS.

- [ ] **Step 5:** Commit each handler change as its own commit.

```bash
git commit -m "feat(people): record job_history on <action>"
```

---

## Task 3 — `GetJobHistoryQuery` + handler (TDD)

**Files:**

- Create: `.../application/queries/get-job-history.query.ts`, `.handler.ts`, `.handler.spec.ts`

- [ ] **Step 1:** Write the query DTO:

```ts
export class GetJobHistoryQuery {
  constructor(
    public readonly profileId: string,
    public readonly tenantId: string,
  ) {}
}
```

- [ ] **Step 2:** Spec. Cover:
  - Returns empty array when profile has no history.
  - Returns entries sorted by `effectiveFrom` DESC (repo already does this; assert passthrough).
  - Throws `ForbiddenException` or returns empty if viewer does not have access to the profile — cross-reference how `get-person-profile.handler.ts` gates access today; follow the same pattern.

- [ ] **Step 3:** Implement:

```ts
import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  JOB_HISTORY_REPOSITORY,
  type IJobHistoryRepository,
} from '../../domain/repositories/job-history.repository'
import type { JobHistoryEntry } from '../../domain/entities/job-history-entry.entity'
import { GetJobHistoryQuery } from './get-job-history.query'

@QueryHandler(GetJobHistoryQuery)
export class GetJobHistoryHandler implements IQueryHandler<GetJobHistoryQuery, JobHistoryEntry[]> {
  constructor(
    @Inject(JOB_HISTORY_REPOSITORY)
    private readonly repo: IJobHistoryRepository,
  ) {}

  async execute(query: GetJobHistoryQuery): Promise<JobHistoryEntry[]> {
    return this.repo.findByProfile(query.profileId, query.tenantId)
  }
}
```

- [ ] **Step 4:** Register the handler in `people.module.ts`'s query handler list (follow existing pattern — look at how `GetPersonProfileHandler` is registered).

- [ ] **Step 5:** Run spec → PASS.

- [ ] **Step 6:** Commit.

---

## Task 4 — Expose `directory.getJobHistory` tRPC procedure

**Files:**

- Modify: `apps/api/src/modules/people/interface/trpc/people.router.ts`

- [ ] **Step 1:** Add procedure. Input schema: `{ profileId: z.string().uuid() }`. Wire to `QueryBus.execute(new GetJobHistoryQuery(...))`. Output: return entries directly.

- [ ] **Step 2:** Extend `people.router.spec.ts` with a happy-path test for the new procedure.

- [ ] **Step 3:** Run spec → PASS.

- [ ] **Step 4:** Commit.

---

## Task 5 — PROGRESS.md + PR

- [ ] **Step 1:** Flip row 001 in `docs/clones/ems/PROGRESS.md` from `pending` to `done` with PR link.

- [ ] **Step 2:** Open PR using the template. Note in "Spec re-read deltas" that `job_history` writes happen via recorder service calls in existing commands (not a new command).

---

## Acceptance criteria

- `job_history` entries are created when activation, department transfer, termination commands run.
- `directory.getJobHistory` returns entries in `effectiveFrom DESC` order.
- Unit tests green for recorder service and handler.
- No `Promise.all` on DB queries anywhere in this PR.
- PROGRESS task 001 = `done`.
