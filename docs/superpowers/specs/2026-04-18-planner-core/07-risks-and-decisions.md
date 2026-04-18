# 07 — Confirmed Decisions, Risks, and Cross-Sub-Project Dependencies

## Confirmed decisions (open items, resolved during brainstorming)

| #   | Item                                 | Decision                                                                                     |
| --- | ------------------------------------ | -------------------------------------------------------------------------------------------- |
| 1   | AI reminders + KPI linkage ownership | Moved out of `planner` to Sub-project #5 as layered features. CLAUDE.md updated in Phase 1.9 |
| 2   | Label color palette                  | 25 Radix dark-palette scales mapped to `category1..category25`                               |
| 3   | Soft-delete retention                | Keep forever; purge job added later per tenant policy                                        |
| 4   | Rich content paste                   | Silently strip; show one-time toast                                                          |
| 5   | `platform_admin` UI                  | None in Phase 1; API-only access                                                             |
| 6   | `web-admin` MS 365 connection page   | Phase 4 deliverable                                                                          |
| 7   | Guest access                         | Not in Phase 1; blocker documented for Phase 4                                               |
| 8   | Description length cap               | 32 000 chars; re-verify in Phase 4 against Graph                                             |
| 9   | Performance targets                  | `tasks.getBoard` <150 ms p95, drag-drop <200 ms p95, test-enforced                           |
| 10  | Outbox consumers                     | Only `notifications` in Phase 1; `insights` + Phase 4 sync later                             |

## Risks and mitigations

| Risk                                                      | Likelihood | Impact         | Mitigation                                                                                  |
| --------------------------------------------------------- | ---------- | -------------- | ------------------------------------------------------------------------------------------- |
| MS order-hint algorithm drift                             | Medium     | High           | Port MS algorithm verbatim; golden fixtures from MS docs                                    |
| Order-hint string growth under heavy inserts              | Low        | Medium         | Documented ceiling; rebalance routine in Phase 4                                            |
| Checklist counter race                                    | Low        | Low            | Same-txn atomic `UPDATE ... SET count = count + 1`                                          |
| 32 KB description cap mismatch with real MS limit         | Medium     | Low            | Documented assumption; Phase 4 validates against Graph                                      |
| 2 400-task plans performance cliff                        | Low        | Medium         | Target <200 in Phase 1; virtualization spike in Sub-project #2 if needed                    |
| `identity.externalUserId` pre-Phase-1.0 PR delay          | Low        | Low            | Trivial PR; gate Phase 1.0 on its merge                                                     |
| `@dnd-kit` + virtualization integration                   | Medium     | Low            | Spike task in Sub-project #2 before committing                                              |
| Strict (A) backfires with users                           | Unknown    | High (product) | Ship to SETA internal tenant first; feedback loop before external rollout                   |
| Evidence scope creep toward approval workflow             | Medium     | Low            | Verify button disabled with Phase 5 tooltip to set expectation                              |
| Comment sync-shape divergence from Group threads          | Medium     | Medium         | Match known MS shape; Phase 4 contract tests against sandbox Graph                          |
| Soft-delete confusion (deleted rows leaking into queries) | Low        | Low            | Default `deleted_at IS NULL` filter in every repo query; lint rule requires opt-out comment |

## Cross-sub-project dependencies

| Sub-project        | Depends on Phase 1                                                                                     | Phase 1 depends on it                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| #2 (more views)    | Builds on `tasks.getBoard` and field-mutation commands already shipped in 1.3                          | None                                                                                          |
| #3 (personal hubs) | Uses `PlannerQueryFacade.listPlansForActor` and a new `listTasksForActor` method (added in #3's spec)  | None                                                                                          |
| #4 (sync)          | Uses all `ms_*` schema reservations; consumes outbox events; adds sync workers                         | Adds `ms-graph/` implementation inside `planner.infrastructure`; adds admin UI in `web-admin` |
| #5 (premium)       | Layered tables joined at read time: `task_goal_link`, `task_dependency`, etc. Evidence verification UI | None directly; may add `PlannerQueryFacade` read methods                                      |

## Pre-Phase-1.0 dependency on `identity` module

One small PR to `identity` **before** Phase 1.0 starts:

- Add `externalUserId` column on `identity.user` (nullable text + unique `(tenantId, providerType, externalUserId)` index).
- Add `IdentityQueryFacade.getExternalUserId(actorId)` and `getActorIdByExternalUserId(aadUserId)`.

These methods are unused in Phase 1 but their signatures must exist so Phase 4 is a drop-in, not a planner refactor.

## CLAUDE.md update (Phase 1.9)

CLAUDE.md currently attributes "AI reminders" and "KPI linkage" to the `planner` module. Under strict lockstep, these are layered features for Sub-project #5 and do not belong in the `planner` module. The PR that completes Sub-project #1 updates CLAUDE.md's domain-modules table to reflect this.
