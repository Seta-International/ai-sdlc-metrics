# Plan 04 — Task 003 Closure (Directory Hierarchy Filter)

> Covers spec §5 row "Task 003-directory-search". No schema dependency.

**Goal:** Add recursive department-hierarchy filtering to `list-directory.handler.ts`. When a caller filters by `departmentId`, results include employees in sub-departments too.

**Architecture:** One handler change. Use a recursive CTE inside the Drizzle query for `directory_search_index` joined with the department tree. No new repo methods, no new tables.

---

## File Map

| File                                                                             | Action | Purpose                                     |
| -------------------------------------------------------------------------------- | ------ | ------------------------------------------- |
| `apps/api/src/modules/people/application/queries/list-directory.handler.ts`      | Modify | Add hierarchy recursion when filter present |
| `apps/api/src/modules/people/application/queries/list-directory.handler.spec.ts` | Modify | Add tests covering 3-level hierarchy        |
| `apps/api/src/modules/people/interface/trpc/people.router.spec.ts`               | Modify | Add hierarchy integration assertion         |
| `docs/clones/ems/PROGRESS.md`                                                    | Modify | Flip task 003 to `done`                     |

---

## Task 1 — Find the department table

- [ ] **Step 1:** `grep -rn "department" apps/api/src/modules/people/infrastructure/schema/` to locate the department table. It probably lives under `people` or a sibling `org` schema. Note the table name, PK column, and parent-FK column (something like `parentDepartmentId`).

If the table has no parent-FK, STOP — hierarchy filtering requires a parent relationship. Open a spec question with the user: either the department tree lives in another module (kernel?) or this task needs schema first.

---

## Task 2 — Extend list-directory handler spec (TDD)

**Files:**

- Modify: `list-directory.handler.spec.ts`

- [ ] **Step 1:** Seed a 3-level department tree in the test: `Engineering` → `Backend` → `API`. Seed employees in each.

- [ ] **Step 2:** Add test: filter by `Engineering` returns employees from all three levels.

- [ ] **Step 3:** Add test: filter by `Backend` returns `Backend + API` employees, not `Engineering`.

- [ ] **Step 4:** Add test: filter by leaf `API` returns only that department's employees (existing behavior, should still pass).

- [ ] **Step 5:** Add test: no department filter returns all employees (existing behavior).

- [ ] **Step 6:** Run specs → 3 new fail, existing ones pass.

---

## Task 3 — Implement recursive CTE

**Files:**

- Modify: `list-directory.handler.ts`

- [ ] **Step 1:** When `filters.departmentId` is provided, build a recursive CTE that resolves the department plus all descendants. Drizzle does not have first-class CTE support; use `sql` tagged templates.

```ts
import { sql } from 'drizzle-orm'

// Inside execute():
const departmentTree = cmd.filters?.departmentId
  ? sql`
      WITH RECURSIVE dept_tree AS (
        SELECT id FROM <schema>.department
          WHERE tenant_id = ${cmd.tenantId} AND id = ${cmd.filters.departmentId}
        UNION ALL
        SELECT d.id FROM <schema>.department d
          INNER JOIN dept_tree t ON d.parent_department_id = t.id
          WHERE d.tenant_id = ${cmd.tenantId}
      )
      SELECT id FROM dept_tree
    `
  : null

const rows = await this.db
  .select(/* ... */)
  .from(directorySearchIndex)
  .where(
    and(
      eq(directorySearchIndex.tenantId, cmd.tenantId),
      departmentTree ? sql`${directorySearchIndex.departmentId} IN (${departmentTree})` : undefined,
      // ... existing filters
    ),
  )
```

Replace `<schema>` with the correct schema name from Task 1.

- [ ] **Step 2:** Run specs → PASS.

- [ ] **Step 3:** Ensure query remains RLS-safe — the CTE's `SELECT` must include `tenant_id = ${cmd.tenantId}` at every recursion step (already in the template above).

- [ ] **Step 4:** Commit.

```bash
git add apps/api/src/modules/people/application/queries/list-directory.*
git commit -m "feat(people): directory.listDirectory respects department hierarchy"
```

---

## Task 4 — Router integration test

**Files:**

- Modify: `people.router.integration.spec.ts`

- [ ] **Step 1:** Add E2E test: seed 3-level department + employees, hit `directory.listDirectory` through tRPC, assert hierarchy expansion works end-to-end (with RLS session active).

- [ ] **Step 2:** Run → PASS.

- [ ] **Step 3:** Commit.

---

## Task 5 — PROGRESS.md + PR

- [ ] Flip row 003 to `done` with PR link.
- [ ] Open PR.

---

## Acceptance criteria

- Filtering by parent department returns employees from all descendant departments.
- Filtering by leaf department returns only that department's employees.
- No new repo methods, no new tables.
- RLS invariants preserved.
- PROGRESS task 003 = `done`.
