# Plan 10 — Task 009 Closure (Bulk Ops — Status + Manager)

> Covers spec §5 row "Task 009-bulk-ops-csv-import". No schema dependency.

**Goal:** Add `BulkUpdateStatusCommand` and `BulkUpdateManagerCommand`, mirroring the existing `BulkUpdateDepartmentCommand`.

---

## File Map

| File                                                                                   | Action | Purpose                                                     |
| -------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------- |
| `apps/api/src/modules/people/application/commands/bulk-update-status.command.ts`       | Create | Command DTO                                                 |
| `apps/api/src/modules/people/application/commands/bulk-update-status.handler.ts`       | Create | Handler                                                     |
| `apps/api/src/modules/people/application/commands/bulk-update-status.handler.spec.ts`  | Create | Unit test                                                   |
| `apps/api/src/modules/people/application/commands/bulk-update-manager.command.ts`      | Create | Command DTO                                                 |
| `apps/api/src/modules/people/application/commands/bulk-update-manager.handler.ts`      | Create | Handler                                                     |
| `apps/api/src/modules/people/application/commands/bulk-update-manager.handler.spec.ts` | Create | Unit test                                                   |
| `apps/api/src/modules/people/infrastructure/jobs/process-bulk-operation.job.ts`        | Modify | Handle `status_update` + `manager_transfer` operation types |
| `apps/api/src/modules/people/interface/trpc/people.router.ts`                          | Modify | Expose two new procedures                                   |
| `apps/api/src/modules/people/people.module.ts`                                         | Modify | Register handlers                                           |
| `docs/clones/ems/PROGRESS.md`                                                          | Modify | Flip task 009 to `done`                                     |

---

## Task 1 — Read existing `BulkUpdateDepartmentCommand` for pattern

- [ ] **Step 1:** Read `bulk-update-department.command.ts` + `.handler.ts` + `.spec.ts` in full. Note: handler inserts a `bulk_operation` row; the actual per-employment updates happen in `process-bulk-operation.job.ts`.

- [ ] **Step 2:** Read `process-bulk-operation.job.ts`. Note the `operationType` dispatch pattern.

---

## Task 2 — `BulkUpdateStatusCommand` (TDD)

- [ ] **Step 1:** Command DTO. Mirror `BulkUpdateDepartmentCommand`:

```ts
export class BulkUpdateStatusCommand {
  constructor(
    public readonly tenantId: string,
    public readonly employmentIds: string[],
    public readonly newStatus: 'active' | 'on_leave' | 'suspended',
    public readonly effectiveFrom: Date,
    public readonly reason: string | null,
    public readonly requestedBy: string,
  ) {}
}
```

Note: exclude `terminated` — terminations go through the dedicated lifecycle command with event emission.

- [ ] **Step 2:** Handler: insert `bulk_operation` row with `operationType: 'status_update'`, payload `{ newStatus, effectiveFrom, reason }`. Use the existing `IBulkOperationRepository.insert`.

- [ ] **Step 3:** Spec. Cover:
  - Empty `employmentIds` → throws.
  - Invalid status (`terminated`) → throws.
  - Happy path: returns `BulkOperation` with `status: 'pending'`.

- [ ] **Step 4:** Run → PASS. Commit.

---

## Task 3 — `BulkUpdateManagerCommand` (TDD)

- [ ] **Step 1:** Command DTO:

```ts
export class BulkUpdateManagerCommand {
  constructor(
    public readonly tenantId: string,
    public readonly employmentIds: string[],
    public readonly newManagerProfileId: string,
    public readonly effectiveFrom: Date,
    public readonly reason: string | null,
    public readonly requestedBy: string,
  ) {}
}
```

- [ ] **Step 2:** Handler: same pattern, `operationType: 'manager_transfer'`.

- [ ] **Step 3:** Spec. Cover empty list, self-manager (can't set manager to same profile), happy path.

- [ ] **Step 4:** Run → PASS. Commit.

---

## Task 4 — Extend `process-bulk-operation.job.ts`

- [ ] **Step 1:** Extend the job's dispatch to handle `status_update` and `manager_transfer`. Each branch:
  - Loops over `employmentIds` sequentially (no `Promise.all` on DB).
  - Calls the appropriate repo method (`employmentRepo.updateStatus`, a new `employmentRepo.updateManager`, etc.).
  - Records a `job_history` entry (status change → `lateral` or `manager_change` respectively) via `JobHistoryRecorderService`.
  - Collects errors per-employment; updates the `bulk_operation.errors` JSONB with failures at end.
  - Updates `successCount` / `failureCount` / `status: 'completed'`.

- [ ] **Step 2:** Extend job spec. Cover both new types.

- [ ] **Step 3:** Run → PASS. Commit.

---

## Task 5 — tRPC procedures

- [ ] `bulkOps.updateStatus`, `bulkOps.updateManager`. Admin-only permission.

- [ ] Router spec. Commit.

---

## Task 6 — PROGRESS.md + PR

- [ ] Flip row 009 to `done`. Open PR.

---

## Acceptance criteria

- `bulk_operation` rows created with correct `operationType`.
- Background job processes both new types correctly, records `job_history`, captures per-row errors.
- PROGRESS task 009 = `done`.
