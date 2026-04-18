# Employee Module Completion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement these plans task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source spec:** `docs/superpowers/specs/2026-04-18-employee-module-completion-design.md`

**Goal:** Close the 10 remaining `partial` employee tasks identified by the 2026-04-18 audit, leaving the `people` module fully migrated.

**Architecture:** Hexagonal + DDD (CLAUDE.md). One module (`people`), one schema (`people`), one exported facade (`PeopleQueryFacade`). Domain pure, Drizzle in infrastructure, tRPC in interface. Events in `@future/event-contracts` as plain TS.

**Tech stack:** NestJS, Drizzle ORM, PostgreSQL 16 with RLS, tRPC, Zod, pg-boss, Vitest/Jest, Testcontainers.

---

## Plan files

| #   | Plan                                                                | PR count | Size | Depends on |
| --- | ------------------------------------------------------------------- | -------- | ---- | ---------- |
| 01  | [Schema consolidation](./01-schema-consolidation.md)                | 1        | M    | —          |
| 02  | [Task 001 — schema evolution](./02-schema-evolution.md)             | 1        | M    | 01         |
| 03  | [Task 002 — rehire lifecycle](./03-rehire.md)                       | 1        | M    | 01, 02     |
| 04  | [Task 003 — directory hierarchy](./04-directory-hierarchy.md)       | 1        | S    | —          |
| 05  | [Task 004 — request section change](./05-request-section-change.md) | 1        | S    | 01         |
| 06  | [Task 005 — employee documents](./06-employee-documents.md)         | 1        | S    | —          |
| 07  | [Task 006 — custom fields](./07-custom-fields.md)                   | 1        | S    | 01         |
| 08  | [Task 007 — probation reminders](./08-probation-reminders.md)       | 1        | M    | —          |
| 09  | [Task 008 — LinkedIn OAuth](./09-linkedin-oauth.md)                 | 1–2      | M–L  | —          |
| 10  | [Task 009 — bulk ops](./10-bulk-ops.md)                             | 1        | S    | —          |
| 11  | [Task 011 — profile completeness](./11-profile-completeness.md)     | 1        | S    | —          |

---

## Execution order

1. **Plan 01 first** — the schema migration unblocks plans 02, 03, 05, 07.
2. After 01 lands, plans 04, 06, 08, 09, 10, 11 can start in parallel.
3. Plans 02, 03, 05, 07 wait for 01.
4. Cap open PRs at 3. Interleave S and M sizes.

---

## Shared invariants — every PR must follow

Pulled from `CLAUDE.md`. These are PR-blocking if violated.

1. **No cross-module imports except facades.** Everything inside `apps/api/src/modules/people/**`. If a handler needs data from another module, inject that module's `*QueryFacade`. Never a repo token, never another module's entity.
2. **Directory split:**
   - `domain/repositories/` → data access interfaces (`IJobHistoryRepository`, etc.).
   - `domain/ports/` → outbound integrations (`LinkedInOAuthPort`, `ReminderSchedulerPort`).
     The directory is the contract.
3. **No `.js` on relative imports.** Write `'./foo'`, never `'./foo.js'`. NodeNext + CJS.
4. **Module `exports` stays facade-only.** Extend `PeopleQueryFacade` if other modules need new read capability.
5. **Events in `packages/event-contracts/src/people/` as plain TS.** No NestJS imports.
6. **No silent stubs.** `useValue: {}` forbidden. Wire real adapters or block the PR.
7. **No `Promise.all` for DB queries inside handlers.** Sequential `await` only. `DB_TOKEN` is a single `PoolClient` per request (RLS). Concurrent queries deprecate on `pg@8`, throw on `pg@9`. `Promise.all` is fine for non-DB async work (external API calls, in-memory computation).
8. **Tests co-located.** `foo.handler.spec.ts` next to `foo.handler.ts`. Never `__tests__/`.
9. **Every new table has `tenant_id`.** RLS policy mirrors existing `people` schema tables.
10. **No backwards-compat shims.** Update callers; never preserve old interfaces.

---

## Shared patterns — follow these

### Command handler template

See `apps/api/src/modules/people/application/commands/bulk-update-department.handler.ts` for the canonical shape:

- `@CommandHandler(TheCommand)` decorator
- Constructor injection via `@Inject(SYMBOL)` with repository interface type
- `execute(command)` validates inputs, then calls repo
- Errors thrown as domain exceptions (see `domain/exceptions/`)

### Repository interface template

See `apps/api/src/modules/people/domain/repositories/employment.repository.ts`:

- `export const FOO_REPOSITORY = Symbol('IFooRepository')`
- `export interface IFooRepository { ... }`
- Methods take `tenantId` explicitly even though RLS enforces it (defense in depth)

### Event contract template

See `packages/event-contracts/src/people/contract-version-created.event.ts`:

- Plain TS interface/class, zero NestJS
- Frozen shape — events are contracts, not DTOs
- Consumer-facing name (`XWasDone` past tense) or intent (`XRequested`)

### Test template — command handler

Look at `batch-approve-changes.handler.spec.ts`:

- Vitest `describe`/`it`
- Mocks created via `vi.fn()`; repo token stub object satisfies the interface
- Happy path first; one `it` per error path
- Assertions on both return value AND repo method calls (arg capture)

### Test template — router integration

Look at `people.router.integration.spec.ts` for Testcontainers + real DB flow.

### Migration file

Location: `packages/db/drizzle/migrations/NNNN_<name>.sql`. Current latest is `0001_rls_and_extras.sql`. Plan 01 lands `0002_*`. Subsequent plans that add migrations (05, 09) determine their number at PR-open time by running `bun run --cwd packages/db db:generate` — Drizzle Kit picks the next sequential number based on existing files. If two PRs are open simultaneously and both claim the same number, rebase the later one and regenerate. Hand-edit generated SQL only for RLS policies / data migrations / `CREATE INDEX CONCURRENTLY`.

---

## PR description template — every PR uses this

```markdown
## What

<1-2 sentences on what this PR closes and why.>

## Spec re-read deltas

<List any deviations from the task spec or audit discovered during implementation. If none: "No deltas — implementation matches spec exactly.">

## DDD compliance

- **Cross-module facades used:** <list, or "none">
- **New ports added:** <path, or "none">
- **New repositories added:** <path, or "none">
- **New events added:** <list in packages/event-contracts, or "none">
- **Stubs used:** <list with justification, or "none">

## Tests

- Unit: <file count, coverage delta>
- Integration: <file count>
- E2E: <file count, or "none">

## PROGRESS.md

Flipped `employee/<task>` from `pending` to `done`.
```

---

## Completion criteria for the whole plan

- All 10 task rows in `docs/clones/ems/PROGRESS.md` flipped from `pending` to `done` with PR links.
- `bun run test:unit` and `bun run test:integration` green across `modules/people`.
- Coverage ≥70% for `modules/people` (lines, functions, branches).
- No `useValue: {}` stubs in merged `people` code.
- Summary table at top of `PROGRESS.md` updated to `11/11 done` (10 from this plan + 1 from the sibling field-access wiring PR).
