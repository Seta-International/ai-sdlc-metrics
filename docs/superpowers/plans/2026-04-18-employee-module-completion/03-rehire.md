# Plan 03 — Task 002 Closure (Rehire Lifecycle)

> Covers spec §5 row "Task 002-lifecycle-state-machine". Depends on Plans 01 and 02.

**Goal:** Add the `RehireCommand` and the two missing events (`TerminationInitiatedEvent`, `EmployeeRehiredEvent`). Rehiring creates a **new** `person_profile` + `employment` pair linked to the old profile via `previousProfileId`.

**Architecture:** New command handler calls existing `person-profile.repository` + `employment.repository` sequentially. Emits `EmployeeRehiredEvent` via outbox pattern (`@future/event-contracts`). `TerminationInitiatedEvent` added to the existing termination handler, alongside the already-emitted `EmploymentTerminatedEvent`.

---

## File Map

| File                                                                                                                | Action | Purpose                                  |
| ------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------- |
| `packages/event-contracts/src/people/termination-initiated.event.ts`                                                | Create | Event contract                           |
| `packages/event-contracts/src/people/employee-rehired.event.ts`                                                     | Create | Event contract                           |
| `packages/event-contracts/src/people/index.ts`                                                                      | Modify | Re-export both events                    |
| `apps/api/src/modules/people/application/commands/rehire-employment.command.ts`                                     | Create | Command DTO                              |
| `apps/api/src/modules/people/application/commands/rehire-employment.handler.ts`                                     | Create | Handler                                  |
| `apps/api/src/modules/people/application/commands/rehire-employment.handler.spec.ts`                                | Create | Unit test                                |
| `apps/api/src/modules/people/application/commands/give-notice.handler.ts` (or wherever `TerminationInitiated` fits) | Modify | Emit new event on notice-start           |
| `apps/api/src/modules/people/interface/trpc/people.router.ts`                                                       | Modify | Expose `employment.rehire`               |
| `apps/api/src/modules/people/people.module.ts`                                                                      | Modify | Register handler in CommandHandlers list |
| `docs/clones/ems/PROGRESS.md`                                                                                       | Modify | Flip task 002 to `done`                  |

---

## Task 1 — Event contracts (TDD)

**Files:**

- Create: two event files + index re-export

- [ ] **Step 1:** Write both event contracts. Plain TS, no NestJS.

`termination-initiated.event.ts`:

```ts
export interface TerminationInitiatedEvent {
  readonly tenantId: string
  readonly employmentId: string
  readonly profileId: string
  readonly actorId: string
  readonly terminationDate: string // ISO date
  readonly terminationReason: string
  readonly initiatedBy: string
  readonly occurredAt: string // ISO timestamp
}

export const TERMINATION_INITIATED_EVENT = 'people.termination.initiated' as const
```

`employee-rehired.event.ts`:

```ts
export interface EmployeeRehiredEvent {
  readonly tenantId: string
  readonly newProfileId: string
  readonly previousProfileId: string
  readonly newEmploymentId: string
  readonly actorId: string
  readonly rehireDate: string // ISO date
  readonly rehiredBy: string
  readonly occurredAt: string // ISO timestamp
}

export const EMPLOYEE_REHIRED_EVENT = 'people.employee.rehired' as const
```

- [ ] **Step 2:** Re-export from `packages/event-contracts/src/people/index.ts`.

- [ ] **Step 3:** Rebuild the package:

```bash
bun run --filter @future/event-contracts build
```

- [ ] **Step 4:** Commit.

```bash
git add packages/event-contracts/src/people/
git commit -m "feat(event-contracts): TerminationInitiatedEvent + EmployeeRehiredEvent"
```

---

## Task 2 — `RehireCommand` + handler (TDD)

**Files:**

- Create: `rehire-employment.command.ts`, `rehire-employment.handler.ts`, `rehire-employment.handler.spec.ts`

- [ ] **Step 1:** Write the command DTO:

```ts
export class RehireEmploymentCommand {
  constructor(
    public readonly tenantId: string,
    public readonly previousProfileId: string,
    public readonly actorId: string,
    public readonly rehireDate: Date,
    public readonly workerType: 'employee' | 'contingent',
    public readonly employmentType: 'permanent' | 'fixed_term' | 'intern',
    public readonly countryCode: string | null,
    public readonly jobTitle: string | null,
    public readonly departmentId: string | null,
    public readonly managerProfileId: string | null,
    public readonly rehiredBy: string,
  ) {}
}
```

- [ ] **Step 2:** Write the spec. Cover:
  - Happy path: creates new profile, new employment with `previousProfileId` set, records `job_history` with `changeType: 'rehire'`, emits `EmployeeRehiredEvent`.
  - Error: `previousProfileId` does not exist → throws `NotFoundException`.
  - Error: previous employment is still active (not terminated) → throws `InvalidRehireException` (add to `domain/exceptions/` if missing).
  - Sequential DB calls only — no `Promise.all` on repos.

- [ ] **Step 3:** Run → FAIL.

- [ ] **Step 4:** Implement. Reference `activate-employment.handler.ts` for outbox event publishing pattern (probably via an `OutboxEventRepository` or similar). Sketch:

```ts
async execute(cmd: RehireEmploymentCommand): Promise<{ profileId: string; employmentId: string }> {
  const prevProfile = await this.profileRepo.findById(cmd.previousProfileId, cmd.tenantId)
  if (!prevProfile) throw new NotFoundException(`Profile ${cmd.previousProfileId} not found`)

  const prevEmployment = await this.employmentRepo.findActiveByActorId(prevProfile.actorId, cmd.tenantId)
  if (prevEmployment && prevEmployment.employmentStatus !== 'terminated') {
    throw new InvalidRehireException('Previous employment must be terminated before rehire')
  }

  const newProfile = await this.profileRepo.insert({
    tenantId: cmd.tenantId,
    actorId: cmd.actorId,
    familyName: prevProfile.familyName,
    givenName: prevProfile.givenName,
    // ... copy identity fields from prev profile
  })

  const newEmployment = await this.employmentRepo.insert({
    tenantId: cmd.tenantId,
    personProfileId: newProfile.id,
    previousProfileId: cmd.previousProfileId,
    employmentStatus: 'active',
    workerType: cmd.workerType,
    employmentType: cmd.employmentType,
    countryCode: cmd.countryCode,
    // ... etc
  })

  await this.jobHistoryRecorder.recordRehire({
    profileId: newProfile.id,
    tenantId: cmd.tenantId,
    effectiveFrom: cmd.rehireDate,
    jobTitle: cmd.jobTitle,
    departmentId: cmd.departmentId,
    managerProfileId: cmd.managerProfileId,
    changeReason: 'rehire',
    recordedBy: cmd.rehiredBy,
  })

  await this.outbox.emit({
    eventType: EMPLOYEE_REHIRED_EVENT,
    payload: {
      tenantId: cmd.tenantId,
      newProfileId: newProfile.id,
      previousProfileId: cmd.previousProfileId,
      newEmploymentId: newEmployment.id,
      actorId: cmd.actorId,
      rehireDate: cmd.rehireDate.toISOString().slice(0, 10),
      rehiredBy: cmd.rehiredBy,
      occurredAt: new Date().toISOString(),
    } satisfies EmployeeRehiredEvent,
  })

  return { profileId: newProfile.id, employmentId: newEmployment.id }
}
```

Note: verify the actual outbox API in the existing `activate-employment.handler.ts` — signature may differ. Follow whatever pattern exists; do not invent new outbox plumbing.

- [ ] **Step 5:** Run → PASS.

- [ ] **Step 6:** Register handler in `people.module.ts`.

- [ ] **Step 7:** Commit.

---

## Task 3 — Emit `TerminationInitiatedEvent` from notice handler

**Files:**

- Modify: whichever handler starts the termination (likely `give-notice.handler.ts` — look for the handler that transitions from `active` to `notice_period`).

- [ ] **Step 1:** Extend the handler's spec: after successful transition, `TerminationInitiatedEvent` is emitted via outbox.

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3:** Add `outbox.emit(...)` call with the new event contract.

- [ ] **Step 4:** Run → PASS.

- [ ] **Step 5:** Commit.

---

## Task 4 — tRPC `employment.rehire`

**Files:**

- Modify: `apps/api/src/modules/people/interface/trpc/people.router.ts`

- [ ] **Step 1:** Add procedure. Input: Zod schema matching `RehireEmploymentCommand` fields. Permission check via existing permissions middleware (look for how `activate-employment` is protected; use the same permission or add `people.employment.rehire` to the kernel seed if it doesn't exist).

- [ ] **Step 2:** Extend `people.router.spec.ts` with happy-path test.

- [ ] **Step 3:** Run → PASS.

- [ ] **Step 4:** Commit.

---

## Task 5 — PROGRESS.md + PR

- [ ] Flip row 002 to `done` with PR link.
- [ ] Open PR using the template.

---

## Acceptance criteria

- `RehireEmploymentCommand` creates a new profile + employment linked via `previousProfileId`.
- `job_history` entry recorded with `changeType: 'rehire'`.
- `EmployeeRehiredEvent` emitted via outbox.
- `TerminationInitiatedEvent` emitted when notice starts.
- Permission check on `employment.rehire` tRPC procedure.
- PROGRESS task 002 = `done`.
