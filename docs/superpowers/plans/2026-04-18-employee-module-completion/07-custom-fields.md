# Plan 07 — Task 006 Closure (Custom Fields — Batch Set + Delete)

> Covers spec §5 row "Task 006-custom-fields". GIN index already covered by Plan 01.

**Goal:** Add `SetCustomFieldValuesCommand` (batch set values on a profile) and `DeleteCustomFieldCommand` (soft-delete a definition).

---

## File Map

| File                                                                                       | Action | Purpose                   |
| ------------------------------------------------------------------------------------------ | ------ | ------------------------- |
| `apps/api/src/modules/people/application/commands/set-custom-field-values.command.ts`      | Create | Command DTO               |
| `apps/api/src/modules/people/application/commands/set-custom-field-values.handler.ts`      | Create | Handler                   |
| `apps/api/src/modules/people/application/commands/set-custom-field-values.handler.spec.ts` | Create | Unit test                 |
| `apps/api/src/modules/people/application/commands/delete-custom-field.command.ts`          | Create | Command DTO               |
| `apps/api/src/modules/people/application/commands/delete-custom-field.handler.ts`          | Create | Handler                   |
| `apps/api/src/modules/people/application/commands/delete-custom-field.handler.spec.ts`     | Create | Unit test                 |
| `apps/api/src/modules/people/interface/trpc/people.router.ts`                              | Modify | Expose two new procedures |
| `apps/api/src/modules/people/people.module.ts`                                             | Modify | Register handlers         |
| `docs/clones/ems/PROGRESS.md`                                                              | Modify | Flip task 006 to `done`   |

---

## Task 1 — `SetCustomFieldValuesCommand` (TDD)

- [ ] **Step 1:** Command DTO:

```ts
export class SetCustomFieldValuesCommand {
  constructor(
    public readonly tenantId: string,
    public readonly profileId: string,
    public readonly employmentId: string,
    public readonly values: Record<string, unknown>, // field slug → value
    public readonly setBy: string,
  ) {}
}
```

- [ ] **Step 2:** Spec. Cover:
  - For each key in `values`: validate against `CustomFieldValidationService` (existing). If valid, write to `employment_detail.custom_fields` JSONB merged with existing values.
  - Unknown field slug → throws `UnknownCustomFieldException`.
  - Validation failure (e.g., number out of range) → throws with a list of errors (all errors, not first-fail).
  - Updates `employment_detail.custom_fields` via a single `UPDATE ... SET custom_fields = custom_fields || $values` call — sequential, no `Promise.all`.

- [ ] **Step 3:** Implement. Look at `create-custom-field-definition.handler.ts` for injection shape. Use `employmentDetailRepository.updateCustomFields(employmentId, tenantId, mergedValues)` — add this method if missing.

- [ ] **Step 4:** Run → PASS. Commit.

---

## Task 2 — `DeleteCustomFieldCommand` (TDD)

- [ ] **Step 1:** Command DTO: `id`, `tenantId`, `deletedBy`.

- [ ] **Step 2:** Spec. Cover:
  - Sets `isActive = false` on the definition (soft delete — audit trail preserved).
  - Does NOT remove values from `employment_detail.custom_fields` — historical values stay, but new sets filter out inactive definitions.
  - Already inactive → throws `ConflictException`.
  - Not found → throws `NotFoundException`.

- [ ] **Step 3:** Implement. Reference `update-custom-field-definition.handler.ts` for the repo call pattern — the existing updater may already accept `isActive`; wrap it in a dedicated command for clarity.

- [ ] **Step 4:** Run → PASS. Commit.

---

## Task 3 — tRPC procedures

- [ ] **Step 1:** `customFields.setValues` + `customFields.delete` procedures.

- [ ] **Step 2:** Router spec.

- [ ] **Step 3:** Run → PASS. Commit.

---

## Task 4 — Verify GIN index present (from Plan 01)

- [ ] **Step 1:** `psql` check:

```sql
SELECT indexname FROM pg_indexes WHERE tablename = 'employment_detail' AND schemaname = 'people';
```

Expected: `employment_detail_custom_fields_gin_idx` in the list.

- [ ] **Step 2:** If not present, Plan 01 did not land — STOP and wait for it.

---

## Task 5 — PROGRESS.md + PR

- [ ] Flip row 006 to `done`. Open PR.

---

## Acceptance criteria

- `customFields.setValues` merges values with validation.
- `customFields.delete` soft-deletes definition without removing values.
- GIN index exists.
- PROGRESS task 006 = `done`.
