# Employee Module Completion — Close the 10 Remaining Partials

**Date:** 2026-04-18
**Status:** Draft — awaiting user approval
**Scope:** `apps/api/src/modules/people` (handlers, routers, jobs, events); `packages/db/src/schema/people`; `packages/event-contracts/src/people`.
**Ships in parallel** with the field-access wiring fix (see `2026-04-18-employee-field-access-wiring-design.md`), but on a longer timeline.

## 1. Problem

An audit (2026-04-18) of `/Users/canh/Projects/Seta/future/docs/clones/ems/PROGRESS.md` against the actual code found that all 11 employee tasks claim `pending` but 11/11 are **partial** — substantial work has landed without PROGRESS being updated. Task 010 is the latent-bug case and is handled in the sibling spec. The other 10 have concrete gaps against their original specs in `docs/clones/ems/modules/employee/tasks/`.

The gaps are:

| Task                            | Audit-identified gap                                                                                                                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 001-schema-evolution            | `job_history` table; `previousProfileId` FK on `employment`; enum values `work_experience`, `emergency_contact`, `project_history`, `license` on `profile_section`; `IJobHistoryRepository` + entity |
| 002-lifecycle-state-machine     | `RehireCommand` + handler; `TerminationInitiatedEvent`, `EmployeeRehiredEvent` in event-contracts                                                                                                    |
| 003-directory-search            | Department hierarchy filter (recursive CTE in `list-directory.handler.ts`)                                                                                                                           |
| 004-change-request-enhancements | `RequestSectionChangeCommand` + handler + tRPC                                                                                                                                                       |
| 005-employee-documents          | `ListEmployeeDocumentsQuery`, `DeleteEmployeeDocumentCommand` + tRPC                                                                                                                                 |
| 006-custom-fields               | `SetCustomFieldValuesCommand` (batch), `DeleteCustomFieldCommand` (soft-delete); GIN index on `employment_detail.custom_fields`                                                                      |
| 007-probation-management        | `setProbation` tRPC procedure wiring; `ListProbationaryEmployeesQuery`; `probation-reminder.job.ts` (30/14/7 day reminders)                                                                          |
| 008-linkedin-share-email        | LinkedIn OAuth implementation (currently throws `NotImplemented`); `ListShareLinksQuery`                                                                                                             |
| 009-bulk-ops-csv-import         | `BulkUpdateStatusCommand`, `BulkUpdateManagerCommand` + tRPC                                                                                                                                         |
| 011-profile-completeness        | `ConfigureCompletenessCommand` + tRPC procedure                                                                                                                                                      |

## 2. Goals & non-goals

### Goals

- Close all 10 task gaps identified above.
- Each PR re-reads its original task spec and reconciles deviations before closing — the audit is the starting point, not the final list.
- Update `PROGRESS.md` incrementally so progress reflects reality as PRs land.
- Respect every DDD rule in `CLAUDE.md` (cross-module imports, facades, ports vs repos, events, stubs, `Promise.all`, `.js` extensions, test co-location).

### Non-goals

- Re-introducing YAGNI items that were consciously skipped in the first pass (e.g., the `completeness_rule` table keeps its current name; the original spec called it `profile_completeness_config` but the current name is equivalent).
- Touching tasks outside the employee module.
- Refactoring existing handlers beyond what each task gap requires.
- Shipping a UI for any of the new commands/queries unless the original task spec already required it.

## 3. Plan structure

```
PR #1 (schema consolidation)  →  PR #2..#11 (features, parallel, any order)
```

**PR #1 — Schema consolidation.** One Drizzle migration covering every schema gap from the 10 tasks, plus the repository ports for new tables. No handler code, no router wiring. Ships first, unblocks every downstream PR.

**PR #2..#11 — One PR per task.** Each PR starts with a spec re-read (fidelity rule: close audit gaps + reconcile against spec, surface any additional deltas in the PR description), then closes the gap with tests.

Ordering inside #2..#11 is flexible — the migration is the only hard sequential dependency. Reviewer bandwidth is the real bottleneck; recommend no more than 3 open PRs at once, interleaving S and M sizes.

## 4. PR #1 — Schema consolidation

### 4.1 Schema deltas

| Delta                                                                                                                                                                        | Source task |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `job_history` table (effective-dated, with `tenant_id`, `profile_id`, `effective_from`, `effective_to`, `job_title`, `department_id`, `change_type`, standard audit columns) | 001         |
| `previousProfileId` FK column on `employment` (nullable, points to `people.profile.id`)                                                                                      | 001         |
| `profile_section` enum values added: `work_experience`, `emergency_contact`, `project_history`, `license`                                                                    | 001         |
| GIN index on `employment_detail.custom_fields` (JSONB path ops)                                                                                                              | 006         |

Tasks 002, 003, 004, 005, 007, 008, 009, 011 have no schema deltas.

### 4.2 Migration hygiene

- Single Drizzle migration file, timestamped, following the existing `0000_flowery_the_order.sql` / `0001_*.sql` numbering.
- Additive-only: new table, new column nullable, new enum values, new index `CREATE INDEX CONCURRENTLY` where supported.
- Migration is safe to deploy before any feature PR lands — no downstream code references the new schema yet.

### 4.3 Repository layer

- Add `IJobHistoryRepository` in `apps/api/src/modules/people/domain/repositories/`.
- Add `JobHistoryEntry` entity in `apps/api/src/modules/people/domain/entities/`.
- Add Drizzle adapter `JobHistoryRepositoryImpl` in `apps/api/src/modules/people/infrastructure/repositories/`.
- Wire the adapter into the module's providers.
- No handlers yet — those ship in the feature PRs.

### 4.4 Open question resolved in PR #1

Does `job_history` backfill from the existing `job_assignment` table, or is it forward-only from this migration? Resolution deadline: before the migration file is written. Default assumption: forward-only, with a note in the PR description. If product requires backfill, a separate migration follows in a later PR.

### 4.5 Tests in PR #1

- Unit tests for the repository adapter.
- Migration smoke test: apply migration on a fresh DB, assert schema matches.
- No handler-level tests (no handlers added in this PR).

## 5. PR #2..#11 — Per-task closure

Each PR follows this shape:

1. **Spec re-read** — read `docs/clones/ems/modules/employee/tasks/2026-04-14-<task>.md`. Reconcile against current code. Surface deltas in the PR description under a "Spec reconciliation" heading. If the delta includes scope the audit missed, either include it in the PR or open a follow-up task and note the deferral.
2. **Close the audit gap** — implement the missing handlers, queries, commands, routers, jobs, and events listed in §1.
3. **Tests** — per CLAUDE.md TDD rule: write tests first; ≥70% coverage; happy path + every error path for command handlers; integration tests for cross-module or DB-touching code.
4. **DDD compliance note** — PR description includes: cross-module facades used, new ports/repositories added (with their directory), new events added, any stubs used and why. Reviewer checks this section first.
5. **PROGRESS.md update** — flip the task's row from `pending` to `done` with a PR link.

### 5.1 Per-task PR sketches

| #   | Task                            | Key deliverables                                                                                                                                                                                                      | Size |
| --- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 2   | 001-schema-evolution            | `JobHistoryEntry` entity shaped behavior; repo methods `findByProfile`, `findAsOf`, `recordChange`; backfill decision resolved and documented                                                                         | M    |
| 3   | 002-lifecycle-state-machine     | `RehireCommand` + handler (creates new profile, links `previousProfileId`); `TerminationInitiatedEvent`, `EmployeeRehiredEvent` in `packages/event-contracts/src/people`; state-machine updates                       | M    |
| 4   | 003-directory-search            | Recursive CTE in `list-directory.handler.ts` to include sub-departments when a department filter is specified; integration test across a 3-level hierarchy                                                            | S    |
| 5   | 004-change-request-enhancements | `RequestSectionChangeCommand` + handler + tRPC procedure; section-level diff payload; existing batch approve/reject handlers handle the new command type                                                              | S    |
| 6   | 005-employee-documents          | `ListEmployeeDocumentsQuery` + handler (by profile + category); `DeleteEmployeeDocumentCommand` + handler (soft-delete); tRPC procedures                                                                              | S    |
| 7   | 006-custom-fields               | `SetCustomFieldValuesCommand` (batch set values on one profile); `DeleteCustomFieldCommand` (soft-delete via `isActive = false` wrapper if no explicit command exists); tRPC procedures                               | S    |
| 8   | 007-probation-management        | Wire `setProbation` tRPC procedure (handler exists, router does not expose it); `ListProbationaryEmployeesQuery`; `probation-reminder.job.ts` scheduling reminders at 30/14/7 days before probation end using pg-boss | M    |
| 9   | 008-linkedin-share-email        | Replace `throw NotImplemented` in `initiate-linkedin-auth.handler.ts` with real OAuth flow (authorization URL, token exchange, token storage via `LinkedInOAuthPort`); `ListShareLinksQuery`                          | M–L  |
| 10  | 009-bulk-ops-csv-import         | `BulkUpdateStatusCommand`, `BulkUpdateManagerCommand` + handlers + tRPC; reuse existing bulk-operation infrastructure                                                                                                 | S    |
| 11  | 011-profile-completeness        | `ConfigureCompletenessCommand` (tenant configures required sections) + handler + tRPC procedure                                                                                                                       | S    |

### 5.2 PR #9 flag — LinkedIn OAuth

PR #9 is the only wildcard. Depending on how the spec wants token storage, refresh, and scope handling, it could balloon past M size. **Spike first during the spec re-read.** If the OAuth flow is > 3 days of work, split into two PRs:

- PR #9a: OAuth flow and `LinkedInOAuthPort`.
- PR #9b: `ListShareLinksQuery`.

## 6. DDD invariants (every PR)

Pulled from `CLAUDE.md` — PR-blocking if violated:

1. **No cross-module imports except facades.** Every PR stays inside `apps/api/src/modules/people/**`. If a handler needs data from `projects`, `kernel`, `identity`, etc., inject that module's `*QueryFacade` — never a repository token, never a domain entity from another module.
2. **Ports vs repositories in the correct directories.**
   - `domain/repositories/` → data access interfaces (e.g., `IJobHistoryRepository`).
   - `domain/ports/` → outbound integrations (e.g., `LinkedInOAuthPort` for PR #9).
3. **No `.js` extensions on relative imports.** NodeNext + CJS. `./foo`, not `./foo.js`.
4. **Module `exports` stay facade-only.** If any PR exposes new cross-module capability, extend `PeopleQueryFacade` — never export a repo token or event handler.
5. **Events in `packages/event-contracts` as plain TS.** Zero NestJS deps. PR #3's two new events go there.
6. **No silent stubs in production paths.** `useValue: {}` is forbidden. Wire a real adapter or block the PR.
7. **No `Promise.all` for DB queries inside handlers.** Sequential `await` only. `DB_TOKEN` is a single `PoolClient` per request (RLS); concurrent queries deprecate on `pg@8`, throw on `pg@9`. `Promise.all` is fine for non-DB async work.
8. **Tests co-located.** `foo.handler.spec.ts` next to `foo.handler.ts`. Never `__tests__/`.
9. **Every new table has `tenant_id`.** `job_history` must include it. RLS policy mirrors existing `people` schema tables.
10. **No backwards-compat shims.** Update callers; never preserve old interfaces.

## 7. Testing strategy

- **Unit tests** for every new command/query handler — happy path + every error path.
- **Integration tests** against real DB for PRs touching the new migration (#2, #7 probation reminder, #10 bulk ops).
- **E2E Playwright** only for PR #9 (LinkedIn OAuth redirect flow). Others are backend-only closures.
- ≥70% coverage on every PR (lines, functions, branches). PRs below the threshold are blocked.

## 8. Risks and mitigations

| Risk                                           | Mitigation                                                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| PR #1 migration blocks everything; long review | Pre-review the migration with the user before opening the PR                                         |
| PR #9 OAuth scope balloons                     | Spike first; if > 3 days, split into PR #9a and #9b                                                  |
| `job_history` backfill ambiguity               | Resolve before PR #1 migration is written; default to forward-only with a documented decision        |
| Reviewer fatigue from 11 PRs in a window       | Cap at 3 open PRs; interleave S and M sizes                                                          |
| Spec re-read surfaces new scope                | PR description's "Spec reconciliation" section surfaces deltas; user decides include-or-defer per-PR |

## 9. Completion criteria

- All 10 task rows in `docs/clones/ems/PROGRESS.md` flipped from `pending` to `done` with PR links.
- `bun run test:unit` and `bun run test:integration` green across the `people` module.
- Coverage ≥70% across the module.
- No `useValue: {}` stubs in merged code.
- A short "employee module closure" note appended to PROGRESS.md summary table, reflecting 11/11 done (10 from this effort + 1 from the sibling field-access spec).
