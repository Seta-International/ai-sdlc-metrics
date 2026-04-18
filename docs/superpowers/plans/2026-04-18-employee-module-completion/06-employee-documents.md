# Plan 06 — Task 005 Closure (Employee Documents — List + Delete)

> Covers spec §5 row "Task 005-employee-documents". No schema dependency.

**Goal:** Add `ListEmployeeDocumentsQuery` and `DeleteEmployeeDocumentCommand` (soft-delete). Upload/acknowledge/expiry handlers already exist.

---

## File Map

| File                                                                                        | Action | Purpose                                      |
| ------------------------------------------------------------------------------------------- | ------ | -------------------------------------------- |
| `apps/api/src/modules/people/application/queries/list-employee-documents.query.ts`          | Create | Query DTO                                    |
| `apps/api/src/modules/people/application/queries/list-employee-documents.handler.ts`        | Create | Handler                                      |
| `apps/api/src/modules/people/application/queries/list-employee-documents.handler.spec.ts`   | Create | Unit test                                    |
| `apps/api/src/modules/people/application/commands/delete-employee-document.command.ts`      | Create | Command DTO                                  |
| `apps/api/src/modules/people/application/commands/delete-employee-document.handler.ts`      | Create | Handler                                      |
| `apps/api/src/modules/people/application/commands/delete-employee-document.handler.spec.ts` | Create | Unit test                                    |
| `apps/api/src/modules/people/domain/repositories/employee-document.repository.ts`           | Modify | Add `listByProfile` + `softDelete`           |
| `apps/api/src/modules/people/infrastructure/repositories/employee-document.repository.ts`   | Modify | Implement new methods                        |
| `apps/api/src/modules/people/interface/trpc/people.router.ts`                               | Modify | Expose `documents.list` + `documents.delete` |
| `apps/api/src/modules/people/people.module.ts`                                              | Modify | Register handlers                            |
| `docs/clones/ems/PROGRESS.md`                                                               | Modify | Flip task 005 to `done`                      |

---

## Task 1 — Extend repository interface + impl

- [ ] **Step 1:** Read `employee-document.repository.ts` (both `domain/` and `infrastructure/`). Note existing methods.

- [ ] **Step 2:** Add to interface:

```ts
listByProfile(
  profileId: string,
  tenantId: string,
  filters?: { category?: string; includeDeleted?: boolean },
): Promise<EmployeeDocument[]>

softDelete(id: string, tenantId: string, deletedBy: string): Promise<void>
```

- [ ] **Step 3:** Implement in infrastructure adapter. `softDelete` sets `deletedAt = now()`, `deletedBy = <actor>`. If the table doesn't have these columns, add them in a mini-migration first (check schema).

- [ ] **Step 4:** Integration test the repo methods.

- [ ] **Step 5:** Commit.

---

## Task 2 — `ListEmployeeDocumentsQuery` + handler (TDD)

- [ ] **Step 1:** Query DTO:

```ts
export class ListEmployeeDocumentsQuery {
  constructor(
    public readonly tenantId: string,
    public readonly profileId: string,
    public readonly category: string | null,
  ) {}
}
```

- [ ] **Step 2:** Spec. Cover:
  - Returns non-deleted documents for the profile.
  - Filter by category narrows results.
  - Empty list when profile has no documents.

- [ ] **Step 3:** Implement handler — single repo call, no business logic.

- [ ] **Step 4:** Run → PASS. Commit.

---

## Task 3 — `DeleteEmployeeDocumentCommand` + handler (TDD)

- [ ] **Step 1:** Command DTO with `id`, `tenantId`, `deletedBy`.

- [ ] **Step 2:** Spec. Cover:
  - Happy path: calls `softDelete`.
  - Not found: throws `NotFoundException` before calling `softDelete`.
  - Already deleted: throws `ConflictException`.
  - Permission: caller must have `people.document.delete` on the owner's profile.

- [ ] **Step 3:** Implement: `findById` → check exists + not deleted → `softDelete`. Two sequential DB calls.

- [ ] **Step 4:** Run → PASS. Commit.

---

## Task 4 — tRPC procedures

- [ ] **Step 1:** Add `documents.list` and `documents.delete` procedures. Input schemas match query/command fields.

- [ ] **Step 2:** Extend router spec.

- [ ] **Step 3:** Run → PASS. Commit.

---

## Task 5 — PROGRESS.md + PR

- [ ] Flip row 005 to `done`. Open PR.

---

## Acceptance criteria

- `documents.list` returns non-deleted documents filtered by profile + optional category.
- `documents.delete` soft-deletes; deleted documents invisible to `list` by default.
- PROGRESS task 005 = `done`.
