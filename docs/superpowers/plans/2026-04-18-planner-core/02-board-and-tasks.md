# Plan 02 — Board Skeleton + Tasks Core

> Covers spec phases: **1.2, 1.3** — see [progress.md](../../specs/2026-04-18-planner-core/progress.md).
> Depends on Plan 01 being merged.

**Goal:** Ship the Board view end-to-end. Buckets CRUD + reorder. `tasks.getBoard` single-snapshot read. Full task CRUD with optimistic concurrency. Drag-drop between buckets using `@dnd-kit` with optimistic updates. Quick-add, due-date/assignee/label/priority/progress quick menus on cards. Task detail panel body is deferred to Plan 03 — this plan lands the board with working interactions.

**Architecture:** Extend the module from Plan 01. Task aggregate gets its full implementation. `tasks.getBoard` is the one "big read" of the zone — three SQL queries plus a `PeopleQueryFacade` batch resolve. Optimistic updates live in `useOptimisticMove`. Field-mutation commands exist for every group-by dimension even though only group-by-Bucket is rendered (so Sub-project #2 can surface the picker without backend changes).

**Tech stack:** unchanged from Plan 01, plus `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/modifiers` on the frontend.

---

## File Map

| File                                                                                    | Action  | Purpose                                                                                                                   |
| --------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/planner/domain/entities/task.entity.ts`                           | Replace | Full aggregate (was stub in Plan 01)                                                                                      |
| `apps/api/src/modules/planner/domain/entities/task-assignee.value-object.ts`            | Create  | VO                                                                                                                        |
| `apps/api/src/modules/planner/domain/repositories/task.repository.ts`                   | Replace | Full interface                                                                                                            |
| `apps/api/src/modules/planner/domain/repositories/bucket.repository.ts`                 | Modify  | Add `reorder`, `softDelete`                                                                                               |
| `apps/api/src/modules/planner/infrastructure/repositories/drizzle-task.repository.ts`   | Create  | Task Drizzle impl (soft-delete aware)                                                                                     |
| `apps/api/src/modules/planner/infrastructure/repositories/drizzle-bucket.repository.ts` | Modify  | Reorder with `orderHint`                                                                                                  |
| `apps/api/src/modules/planner/application/commands/buckets/*.handler.ts`                | Create  | create, rename, reorder, delete                                                                                           |
| `apps/api/src/modules/planner/application/commands/tasks/*.handler.ts`                  | Create  | 11 handlers (create, update, move, setProgress, setPriority, setDates, assign, unassign, applyLabel, removeLabel, delete) |
| `apps/api/src/modules/planner/application/queries/get-board.handler.ts`                 | Create  | Single snapshot read                                                                                                      |
| `apps/api/src/modules/planner/application/services/plan-authorization.service.ts`       | Modify  | Add `assertCanEditTask`, `assertCanUpdateOwnTaskProgress`                                                                 |
| `apps/api/src/modules/planner/application/facades/planner-query.facade.ts`              | Modify  | Implement `countOpenTasksForActor` for real                                                                               |
| `apps/api/src/modules/planner/interface/trpc/{bucket,task}.router.ts`                   | Create  | tRPC procedures                                                                                                           |
| `packages/event-contracts/src/planner/{bucket,task}-events.ts`                          | Create  | Bucket + task outbox event shapes                                                                                         |
| `apps/web-planner/src/app/plans/[planId]/board/page.tsx`                                | Replace | Full Board view                                                                                                           |
| `apps/web-planner/src/components/board/*.tsx`                                           | Create  | `BoardColumn`, `TaskCard`, `TaskCardCover`, `QuickAddTask`, `AddBucketButton`, `BoardDragContext`                         |
| `apps/web-planner/src/components/primitives/*.tsx`                                      | Create  | `PriorityIcon`, `ProgressIcon`, `DueBadge`, `AssigneeAvatarStack`, `LabelPill`                                            |
| `apps/web-planner/src/components/labels/LabelPicker.tsx`                                | Create  | Inline label picker (plan-scoped)                                                                                         |
| `apps/web-planner/src/components/assignees/AssigneePicker.tsx`                          | Create  | Inline assignee picker                                                                                                    |
| `apps/web-planner/src/lib/hooks/useBoardSnapshot.ts`                                    | Create  | React Query wrapper around `tasks.getBoard`                                                                               |
| `apps/web-planner/src/lib/hooks/useOptimisticMove.ts`                                   | Create  | Drag-drop mutation hook                                                                                                   |
| `apps/web-planner/package.json`                                                         | Modify  | Add `@dnd-kit/*` via `bun add`                                                                                            |

---

## Task 1 — Flesh out `Task` aggregate (TDD)

- [ ] **Step 1:** Write `task.entity.spec.ts` covering every invariant from [spec §02](../../specs/2026-04-18-planner-core/02-domain-and-schema.md):
  - `checklistItemCount <= 20` — throws on 21st add; covered by delegate `addChecklistItem`.
  - `assignees.length <= 20` — throws on 21st.
  - `progress = 100 ⟺ completedAt !== null` — state transitions enforce.
  - `coverAttachmentId` must point to an owned attachment.
  - `appliedLabels ⊆ plan.labels` — checked at command-handler level (cross-aggregate).
  - `description.length <= 32000` — throws on long input.
  - Order hint comparison is lexicographic.
  - `markCompleted` sets `completedBy` + `completedAt` and emits event; `reopen` clears both.
- [ ] **Step 2:** Implement `Task` methods: `rename`, `setDescription`, `setProgress`, `setPriority`, `setDates`, `move(bucketId, orderHint)`, `assign(actorId, by)`, `unassign(actorId)`, `applyLabel(slot)`, `removeLabel(slot)`, `softDelete`.
- [ ] **Step 3:** Value object `TaskAssignee` — immutable; spec covers equality.

Acceptance: Domain specs green; no NestJS / Drizzle imports inside `domain/`.

---

## Task 2 — Bucket handlers

- [ ] **Step 1:** `create-bucket.handler.spec.ts` / `.ts` — editor+; auto-computes `orderHint` as last; emits `BucketCreatedEvent`.
- [ ] **Step 2:** `rename-bucket.handler.ts` + spec — optimistic concurrency, editor+.
- [ ] **Step 3:** `reorder-bucket.handler.ts` + spec — accepts `orderHintAfter` / `orderHintBefore`; computes final hint via `MsOrderHint.between`.
- [ ] **Step 4:** `delete-bucket.handler.ts` + spec — soft delete bucket AND all its tasks (via `softDeleteMany` repo call). Emits `BucketDeletedEvent` + one `TaskDeletedEvent` per task.
- [ ] **Step 5:** `bucket.router.ts`: `create`, `rename`, `reorder`, `delete`.

Acceptance: Each handler has happy-path + auth-reject + concurrency-conflict + cascade spec. Integration test confirms cascades.

---

## Task 3 — Task command handlers (11 commands)

Each handler is a separate file with co-located spec. Spec template: happy path, auth reject (including viewer with no exception), validation (title/description length, invalid enum values), cross-aggregate invariants (label slot must exist on plan; bucket must belong to plan), optimistic concurrency, outbox event emission.

- [ ] **Step 1:** `create-task.handler.ts` — editor+; computes `orderHint` (top of bucket by default, or via hints); initial `pendingMsAssignments: []`.
- [ ] **Step 2:** `update-task.handler.ts` — bulk patch (title, description, progress, priority, dates). Viewer-assignees can change `progress` only for their own task.
- [ ] **Step 3:** `move-task.handler.ts` — bucket change + reorder. Handles same-bucket reorder and cross-bucket move with single write.
- [ ] **Step 4:** `set-task-progress.handler.ts` — convenience alias; used when Board is grouped by Progress.
- [ ] **Step 5:** `set-task-priority.handler.ts`, `set-task-dates.handler.ts` — similar.
- [ ] **Step 6:** `assign-task.handler.ts` / `unassign-task.handler.ts` — 20-assignee cap, emits `TaskAssigned/Unassigned`.
- [ ] **Step 7:** `apply-label.handler.ts` / `remove-label.handler.ts` — label slot must be defined on plan; toggles row in `task_applied_label`.
- [ ] **Step 8:** `delete-task.handler.ts` — owner or editor+; soft delete; emits `TaskDeletedEvent`.

Concurrency: every mutation takes `expectedVersion: string`. Repo's `update` uses `WHERE id = ? AND updated_at = ?`; if 0 rows affected, throw `ConcurrentModificationException`.

Acceptance: Full coverage of happy + error paths per handler. Specs confirm the commit's `updated_at` becomes the row's new `expectedVersion`.

---

## Task 4 — `tasks.getBoard` query handler

- [ ] **Step 1:** Spec first. Fixture: plan with 6 buckets, 50 tasks across buckets, 12 labels, 4 members. Assertions:
  - Returns exactly 3 SQL queries (instrument with a query counter).
  - Tasks sorted by `(bucketId, orderHint)`.
  - Buckets sorted by `orderHint`.
  - `assignees` rich-resolved via one `PeopleQueryFacade.getActorsByIds` batch (spy to confirm one call).
  - Counts (`attachmentCount`, `commentCount`, `evidenceCount`) match actual row counts.
  - Denormalized `checklistItemCount`/`checklistCheckedCount` pass through untouched.
  - Non-member actor → 404 (no existence leak).
- [ ] **Step 2:** Implement. Three SQL queries:
  1. Plan + labels + members (join).
  2. Buckets (where plan_id = ? and deleted_at is null).
  3. Tasks (where plan_id = ? and deleted_at is null) with `count(*)` sub-selects for attachment/comment/evidence counts.
- [ ] **Step 3:** Expose at `tasks.getBoard` in the tRPC router with zod input validation.

Acceptance: Integration spec passes all assertions. p95 < 150 ms on CI with seeded 200-task dataset.

---

## Task 5 — Task router (full surface)

- [ ] **Step 1:** `task.router.ts` procedures matching the 11 commands from Task 3 + `getBoard` + `getDetail` (stub returning empty until Plan 03).
- [ ] **Step 2:** Exception → tRPC mapping (reuse helper from Plan 01).
- [ ] **Step 3:** Integration spec that drives a full flow through tRPC client: create → move → complete → delete.

Acceptance: Integration flow green; exception codes match spec §03.

---

## Task 6 — `PlannerQueryFacade.countOpenTasksForActor` for real

- [ ] **Step 1:** Replace stub with real query: `select count(*) from planner.task where tenant_id = ? and assignee in (actor) and progress < 100 and deleted_at is null`.
- [ ] **Step 2:** Spec: 3 tasks (1 completed, 2 open) → returns 2; other-actor's tasks not counted; other-tenant's tasks not counted.

Acceptance: Facade spec green. Method safe to call from other modules.

---

## Task 7 — Frontend dependencies

- [ ] **Step 1:** `bun add -F @future/web-planner @dnd-kit/core @dnd-kit/sortable @dnd-kit/modifiers` (never hand-edit `package.json`).
- [ ] **Step 2:** Verify versions are current and ARM64-compatible (they are — no native bindings).

---

## Task 8 — `BoardDragContext`, `BoardColumn`, `TaskCard`

- [ ] **Step 1:** `BoardDragContext` wraps `DndContext` from `@dnd-kit` with:
  - `sensors: [PointerSensor, KeyboardSensor]` — keyboard support required per a11y rule.
  - `onDragEnd` computes `orderHintAfter` / `orderHintBefore` from neighbor cards and fires `useOptimisticMove.move()`.
- [ ] **Step 2:** `BoardColumn` — header (name, count, menu), `SortableContext` for cards, `<QuickAddTask/>` at top, cards in `orderHint` order. Drop zone highlights with indigo ring-3.
- [ ] **Step 3:** `TaskCard` — title, `PriorityIcon`, `ProgressIcon`, `AssigneeAvatarStack`, `DueBadge`, label pills (max 4 + `+N`), checklist badge (`n/m`), optional cover. Hover reveals top-left checkmark (click → toggle completion, optimistic).
- [ ] **Step 4:** `TaskCardCover` — only rendered when `coverAttachmentId` resolves to an image content-type (from the board snapshot; not loaded separately).
- [ ] **Step 5:** Component specs (Vitest + RTL):
  - `TaskCard` with each state: overdue, today, future, completed, high priority, has cover.
  - `BoardColumn` drop zone accepts keyboard-driven drag and calls the move mutation with correct `orderHint*` args.

Acceptance: Board renders the seeded dataset. Keyboard drag (Space → Arrow → Space) successfully moves a card. Mouse drag is smooth.

---

## Task 9 — `useOptimisticMove`

- [ ] **Step 1:** Hook takes a `tasks.getBoard` query key and exposes `move(taskId, toBucketId, orderHintAfter, orderHintBefore)`.
- [ ] **Step 2:** On call:
  1. Read current cache snapshot.
  2. Compute locally-predicted `orderHint` via client-side `MsOrderHint.between` (shared with server).
  3. Patch cache: move task to `toBucketId` with predicted hint; resort affected buckets.
  4. Fire `trpc.tasks.move.mutation`.
  5. On success: overwrite local task with server response (authoritative hint). On error: revert + toast.
- [ ] **Step 3:** Concurrency: if error is 409, refetch the board and replay the move once. On second failure, surface conflict toast with "Retry".
- [ ] **Step 4:** Spec with `@trpc/react-query` testing utilities simulating success + network error + 409.

Acceptance: Hook covered by unit specs. Board drag remains snappy (no visible lag) under simulated 200 ms network.

---

## Task 10 — `QuickAddTask` and quick menus

- [ ] **Step 1:** `QuickAddTask` at top of each `BoardColumn`:
  - Click opens inline input; Enter creates task at top of bucket (optimistic prepend); keeps input open for rapid entry.
  - Shift+Enter expands to include a due-date picker before submit.
  - Character counter appears at 240/255.
- [ ] **Step 2:** Quick menus on `TaskCard` (kebab or hover menus):
  - **Assignees:** `AssigneePicker` popover (reuses `peopleRouter.searchMembers` from a prior module, or a new `planner.members.search` that scopes to the plan's member list).
  - **Labels:** `LabelPicker` popover showing all 25 plan slots (customized + default), with per-slot rename + recolor affordances.
  - **Priority:** inline dropdown mapping to 1/3/5/9.
  - **Due date:** inline date picker with "Clear".
- [ ] **Step 3:** Component specs for each: picker opens, selection fires the right mutation, optimistic update visible.

Acceptance: Every quick menu writes through a single mutation call; optimistic feedback < 50 ms; cancel returns to prior state.

---

## Task 11 — Bucket UX

- [ ] **Step 1:** Header: click name → contenteditable; Enter saves; Esc cancels. `buckets.rename` mutation.
- [ ] **Step 2:** `AddBucketButton` rightmost; inline input; Enter creates a new column.
- [ ] **Step 3:** Horizontal bucket-reorder drag via another `@dnd-kit` context sharing sensors.
- [ ] **Step 4:** Context menu → delete; if bucket has tasks, confirm dialog: "N tasks will be deleted. Continue?" Cascades through the `delete-bucket` handler.

Acceptance: A full bucket CRUD flow works smoothly; no page reloads; optimistic.

---

## Task 12 — Group-by-drag map (backend only in this plan)

Even though the group-by picker UI is Sub-project #2, the backend commands for every dimension must exist. Confirm by:

- [ ] Mapping-to-command integration test:
  - `tasks.setProgress(progress: 100)` — applies, emits `TaskCompletedEvent`.
  - `tasks.setPriority(9)` — applies.
  - `tasks.setDates(dueDate)` — applies.
  - `tasks.assign(actorId)` with prior assignee replaced = assign-then-unassign in the spec, handled client-side per spec §03.
  - `tasks.applyLabel(slot)` with prior label replaced = same pattern.

Acceptance: Every command reachable via tRPC. When Sub-project #2 ships the picker, no backend changes needed.

---

## Task 13 — E2E flows added

Three new Playwright flows (appended to the suite started in Plan 01):

- [ ] Create plan → bucket → two tasks → drag task between buckets → refresh → order persisted.
- [ ] Mark task complete via card checkmark → moves to bottom of bucket, strike-through applied.
- [ ] Assign a teammate → avatar appears on card → refresh → still there. (Email check deferred to Plan 05.)

Acceptance: All three green locally and in CI.

---

## Task 14 — Performance assertion

- [ ] Seed integration spec: 200 tasks, 10 buckets, 20 labels. Assert:
  - `tasks.getBoard` p95 < 150 ms across 20 runs on CI.
  - `tasks.move` round-trip p95 < 200 ms.
- [ ] Use `performance.now()` or `process.hrtime.bigint()`; report p50/p95/p99 in spec output.

Acceptance: Spec passes within budget. Regression fails the PR.

---

## Deliverable

A reviewable PR that brings the Board view to life. After merge, users with the feature flag can create plans, buckets, tasks; drag tasks between buckets; assign, label, set priority/dates/progress; complete and reopen tasks; delete. Progress checklist in the spec updated for Phase 1.2 and 1.3.
