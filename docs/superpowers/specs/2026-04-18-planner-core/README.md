# Planner Core + Board View — Design Spec

Date: 2026-04-18
Sub-project: #1 of the MS 365 Planner clone initiative
Owner module: `planner`
Status: Draft for review

## Files in this spec

| File                                                     | Contents                                                                            |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [README.md](./README.md)                                 | This file — overview, locked decisions, scope, non-goals                            |
| [01-architecture.md](./01-architecture.md)               | DDD module layout, imports/exports rules, event contracts                           |
| [02-domain-and-schema.md](./02-domain-and-schema.md)     | Domain entities, value objects, invariants, Drizzle schema, RLS                     |
| [03-api.md](./03-api.md)                                 | tRPC API surface, input validation, error mapping                                   |
| [04-frontend.md](./04-frontend.md)                       | `web-planner` zone, components, drag-drop, board interaction details, design tokens |
| [05-permissions.md](./05-permissions.md)                 | Permissions model, `PlanAuthorizationService`, delegation, guest access             |
| [06-testing.md](./06-testing.md)                         | Testing strategy (unit / integration / E2E / performance budgets)                   |
| [07-risks-and-decisions.md](./07-risks-and-decisions.md) | Confirmed decisions, risks & mitigations, cross-sub-project dependencies            |
| [progress.md](./progress.md)                             | Phase plan (1.0 → 1.9) and living progress checklist                                |

## 1. Overview and Context

Future is cloning Microsoft 365 Planner across all features and screens, with bidirectional sync to MS Graph Planner. This spec covers **Sub-project #1**: the core data model, the Board view, the Drizzle schema, the tRPC API, and the `web-planner` zone.

The full initiative is decomposed into five sub-projects; this spec covers the first one only.

| #   | Sub-project                                                                   | Covered here? |
| --- | ----------------------------------------------------------------------------- | ------------- |
| 1   | Core data model + Board view (sync-aware)                                     | **Yes**       |
| 2   | Grid / Schedule / Charts views, filter bar, group-by                          | No            |
| 3   | Personal hubs (My Day / My Tasks / My Plans)                                  | No            |
| 4   | MS 365 2-way sync engine (polling, push/pull, conflict resolution, import UX) | No            |
| 5   | Timeline/Gantt, dependencies, Goals/KPI linkage, AI Planner Agent             | No            |

## 2. Locked Design Decisions (from brainstorming)

These are load-bearing decisions made before this spec was written. They drive every concrete detail in every file.

1. **Strict lockstep with MS Planner's data model.** Our task/plan/bucket/label schema matches MS's exactly: 25 labels max per plan, 20 checklist items max per task, plain-text descriptions ≤32 000 chars, flat checklists, no custom fields, no task-native comments from MS (we build them to map to Group threads). No supersets, no feature drift from MS. Layered features that _never modify syncable fields_ are allowed (e.g., evidence).
2. **Plan is the top-level container.** No intermediate `workspace` entity. A plan is optionally linked to a project (`projectId`, metadata only) and optionally synced to MS (mapping to M365 Group or Roster at sync-enable time). Membership is explicit per plan.
3. **`identity` module owns user/OAuth mapping.** Future `actorId` ↔ AAD `userId` mapping lives in `identity`. Consumed by `planner` via `IdentityQueryFacade`. No user linking logic in `planner`.
4. **App-only MS Graph auth.** One admin-consented service principal per tenant; no per-user delegated OAuth. Sync is a background service workload.
5. **Comments are built in Phase 1** with MS-compatible shape (single thread per task, flat, plain text, author+timestamp, ≤4000 chars). Schema reserves MS Group-thread sync fields.

### Non-goals even at full initiative completion (consequences of Decision #1)

- No markdown / rich-text descriptions
- No nested subtasks
- No custom fields
- No >25 labels, no >20 checklist items
- No task watchers
- No per-task ACLs (plan-level only)
- No task dependencies unless we later add a Dataverse integration (out of scope)

## 3. Scope and Non-Goals for Sub-project #1

### In scope

- Drizzle schema for plans, buckets, tasks, labels, checklists, assignees, attachments, comments, evidence — with nullable `ms_*` fields reserved for Phase 4 sync.
- Board view in `web-planner` zone: Kanban, drag-drop, inline edits, task-detail side panel.
- Full CRUD via tRPC for all above entities.
- Permissions via `KernelQueryFacade` + plan-local membership roles.
- Outbox domain events emitted (consumed by `notifications` module).
- Task-assigned email notifications via existing `notifications` module.
- Tests per CLAUDE.md TDD rules (≥70% coverage, co-located, real DB for integration).

### Explicitly out of scope

| Deferred to    | What                                                                                                                                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sub-project #2 | Grid view, Schedule view, Charts view, filter bar, group-by picker UI. (Phase 1's backend ships the field-mutation commands that a group-by-drag would call, but the frontend only renders group-by-Bucket in Phase 1.) |
| Sub-project #3 | My Day / My Tasks / My Plans hubs                                                                                                                                                                                       |
| Sub-project #4 | MS Graph 2-way sync engine, import-from-MS UX, OAuth admin page, Group-thread comment sync                                                                                                                              |
| Sub-project #5 | Timeline/Gantt, dependencies, goals/KPI linkage, AI Planner Agent, evidence verification workflow                                                                                                                       |

### Schema reservations from day 1

Even though Phase 4 builds the sync engine, Phase 1's schema reserves the sync fields so Phase 4 is additive, not a migration:

```
plan.container_type, ms_group_id, ms_roster_id, ms_plan_id, ms_plan_etag
bucket.ms_bucket_id, ms_bucket_etag
task.ms_task_id, ms_task_etag, ms_task_details_etag
task.pending_ms_assignments (jsonb, default [])
task_comment.ms_thread_id, ms_post_id, ms_post_etag
```

`bucket.order_hint` and `task.order_hint` are the MS-compatible order hints. There is no separate `ms_order_hint` column — the single `order_hint` column serves both local ordering and MS round-trip since we implement MS's exact algorithm.

All sync fields nullable. Zero code interacts with them in Phase 1.

## References

- MS Graph Planner API overview — https://learn.microsoft.com/en-us/graph/api/resources/planner-overview
- MS Planner order-hint format — https://learn.microsoft.com/en-us/graph/api/resources/planner-order-hint-format
- `@dnd-kit` — https://docs.dndkit.com/
- Project CLAUDE.md — repository root
- Project DESIGN.md — repository root
