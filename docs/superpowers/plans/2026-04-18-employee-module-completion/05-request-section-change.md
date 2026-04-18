# Plan 05 — Task 004 Closure (Request Section Change)

> Covers spec §5 row "Task 004-change-request-enhancements". Depends on Plan 01 (uses new `profile_section` enum values).

**Goal:** Add `RequestSectionChangeCommand` — a change-request variant that operates at the section level (e.g., "update my emergency contact block") instead of scalar field level. Reuses the existing `profile_change_request` table.

**Architecture:** New command + handler + tRPC procedure. The existing `batch-approve-changes.handler.ts` and `apply-scheduled-changes.job.ts` already handle any `profile_change_request` row regardless of scope; this PR adds a new way to create them.

---

## File Map

| File                                                                                      | Action | Purpose                                |
| ----------------------------------------------------------------------------------------- | ------ | -------------------------------------- |
| `apps/api/src/modules/people/application/commands/request-section-change.command.ts`      | Create | Command DTO                            |
| `apps/api/src/modules/people/application/commands/request-section-change.handler.ts`      | Create | Handler                                |
| `apps/api/src/modules/people/application/commands/request-section-change.handler.spec.ts` | Create | Unit test                              |
| `apps/api/src/modules/people/interface/trpc/people.router.ts`                             | Modify | Expose `changeRequests.requestSection` |
| `apps/api/src/modules/people/people.module.ts`                                            | Modify | Register handler                       |
| `docs/clones/ems/PROGRESS.md`                                                             | Modify | Flip task 004 to `done`                |

---

## Task 1 — Inspect existing change-request schema

- [ ] **Step 1:** Read `apps/api/src/modules/people/infrastructure/schema/change-requests.schema.ts`. Note:
  - Does `profile_change_request` have a `scope` column? If not, we need to add one (schema delta → this PR blocks on a mini-migration).
  - Does it already support section-level payloads via JSONB?
  - What does `RequestProfileChangeCommand` (the existing scalar variant) look like?

- [ ] **Step 2:** Read the existing `request-profile-change.handler.ts` for the pattern.

- [ ] **Step 3:** Decide: extend existing table with `scope` enum (`field` | `section`) OR rely on payload shape to distinguish. Recommend the enum — queries become clearer.

---

## Task 2 — If schema change needed, add migration (TDD)

- [ ] **Step 1:** Add `scope` column to `profile_change_request` in `change-requests.schema.ts`:

```ts
scope: text('scope', { enum: ['field', 'section'] }).notNull().default('field'),
sectionName: text('section_name', {
  enum: ['identity', 'contact', 'family', 'education', 'work_experience', 'emergency_contact', 'project_history', 'license'],
}),
```

(Sync `sectionName` enum with `profile_section` enum.)

- [ ] **Step 2:** Generate migration via `bun run --cwd packages/db db:generate`. Migration will be `0003_*`.

- [ ] **Step 3:** Apply and smoke-test.

- [ ] **Step 4:** Commit migration + schema change separately from handler.

---

## Task 3 — `RequestSectionChangeCommand` + handler (TDD)

**Files:**

- Create: 3 files

- [ ] **Step 1:** Command DTO:

```ts
import type { ProfileSection } from '../../domain/value-objects/profile-section'

export class RequestSectionChangeCommand {
  constructor(
    public readonly tenantId: string,
    public readonly profileId: string,
    public readonly requestedBy: string,
    public readonly sectionName: ProfileSection,
    public readonly proposedValue: Record<string, unknown>,
    public readonly effectiveDate: Date | null,
    public readonly reason: string | null,
  ) {}
}
```

- [ ] **Step 2:** Spec. Cover:
  - Inserts a `profile_change_request` row with `scope: 'section'`, `sectionName`, `proposedValue` in JSONB, `status: 'pending'`.
  - Throws `ValidationException` when `proposedValue` is empty.
  - Throws `ForbiddenException` when `requestedBy` lacks `people.change-request.submit` permission on the target profile.
  - Emits `SectionChangeRequestedEvent` via outbox (add to `packages/event-contracts/src/people/` as a parallel task if outbox requires it — check existing scalar variant for precedent).

- [ ] **Step 3:** Run → FAIL.

- [ ] **Step 4:** Implement following the existing `request-profile-change.handler.ts` shape.

- [ ] **Step 5:** Run → PASS.

- [ ] **Step 6:** Register in module, commit.

---

## Task 4 — tRPC `changeRequests.requestSection`

- [ ] **Step 1:** Add procedure to `people.router.ts`. Input Zod schema matches command fields (JSONB payload passes through as `z.record(z.unknown())`).

- [ ] **Step 2:** Extend router spec.

- [ ] **Step 3:** Run → PASS.

- [ ] **Step 4:** Commit.

---

## Task 5 — Verify batch approve/reject work with section scope

**Files:**

- Review: `batch-approve-changes.handler.ts`, `apply-scheduled-changes.job.ts`.

- [ ] **Step 1:** Add an integration test that creates a section-scoped request, batch-approves it, asserts the target profile fields are updated.

- [ ] **Step 2:** If the existing handlers assume scalar scope (e.g., apply single `fieldName` / `newValue`), extend them to handle section scope — iterate over `proposedValue` entries. This is in-scope for this PR.

- [ ] **Step 3:** Run → PASS.

- [ ] **Step 4:** Commit.

---

## Task 6 — PROGRESS.md + PR

- [ ] Flip row 004 to `done`.
- [ ] Open PR.

---

## Acceptance criteria

- `RequestSectionChangeCommand` creates a section-scoped change request.
- Existing batch approve/reject + scheduled-apply pipeline handles section scope.
- Event emitted via outbox.
- PROGRESS task 004 = `done`.
