# Plan 03 — Task Detail Panel + Checklist

> Covers spec phases: **1.4, 1.5** — see [progress.md](../../specs/2026-04-18-planner-core/progress.md).
> Depends on Plan 02 being merged.

**Goal:** Ship the task detail side panel with autosave, optimistic concurrency, and the full checklist experience (20-item cap, add-on-Enter, drag-reorder, counter persistence on the card). Attachments, comments, and evidence are stubbed as "Coming in Plan 04" sections inside the panel.

**Architecture:** Next.js intercepting routes render the detail panel as a modal over the Board on client navigation and as a full page on direct URL hit. Autosave is per-field on blur (text inputs) or on change (selects/pickers). Conflict UX uses a three-way merge: panel state (mine), server state (theirs), and field-level decisions. Checklist counters are denormalized on `task` and updated atomically in the same transaction as each item mutation.

**Tech stack:** unchanged from Plan 02.

---

## File Map

| File                                                                                  | Action | Purpose                                                                                                             |
| ------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/planner/domain/entities/checklist-item.value-object.ts`         | Create | VO with `isChecked`, `orderHint`, `title` rules                                                                     |
| `apps/api/src/modules/planner/domain/entities/task.entity.ts`                         | Modify | Add `addChecklistItem`, `toggleChecklistItem`, `updateChecklistItem`, `removeChecklistItem`, `reorderChecklistItem` |
| `apps/api/src/modules/planner/domain/repositories/task.repository.ts`                 | Modify | Add checklist persistence methods (or a dedicated `checklist-item.repository.ts` — see Task 2)                      |
| `apps/api/src/modules/planner/infrastructure/repositories/drizzle-task.repository.ts` | Modify | Transaction-scoped counter maintenance                                                                              |
| `apps/api/src/modules/planner/application/queries/get-task-detail.handler.ts`         | Create | Task + full checklist + attachments (empty) + assignees rich                                                        |
| `apps/api/src/modules/planner/application/commands/checklist/*.handler.ts`            | Create | 4 handlers                                                                                                          |
| `apps/api/src/modules/planner/interface/trpc/{task,checklist}.router.ts`              | Modify | Add `tasks.getDetail` and `checklist.*`                                                                             |
| `packages/event-contracts/src/planner/checklist-events.ts`                            | Create | `ChecklistItemAdded/Updated/Toggled/Removed/Reordered`                                                              |
| `apps/web-planner/src/app/plans/[planId]/board/tasks/[taskId]/page.tsx`               | Create | Intercepting route + fall-through full page                                                                         |
| `apps/web-planner/src/components/task-detail/*.tsx`                                   | Create | `TaskDetailPanel`, `TaskPropertyStrip`, `TaskDescription`, `TaskChecklist`                                          |
| `apps/web-planner/src/lib/hooks/useTaskDetail.ts`                                     | Create | React Query + autosave mutation manager                                                                             |
| `apps/web-planner/src/lib/hooks/useConflictResolver.ts`                               | Create | Field-level keep-mine/theirs logic                                                                                  |

---

## Task 1 — `ChecklistItem` VO and task-aggregate mutators (TDD)

- [ ] **Step 1:** `checklist-item.value-object.spec.ts`:
  - Title 1..255; throws on empty or > 255.
  - `orderHint` is an `MsOrderHint`.
  - Equality: same `id` + same field values.
- [ ] **Step 2:** Extend `task.entity.spec.ts`:
  - `addChecklistItem` at 20 items throws `ChecklistLimitReachedException`.
  - `toggleChecklistItem` updates `isChecked` and maintains `checklistCheckedCount`.
  - `updateChecklistItem(id, title)` mutates only the target.
  - `removeChecklistItem(id)` drops it and decrements counter, preserving `isChecked` accounting.
  - `reorderChecklistItem(id, hintAfter?, hintBefore?)` computes new hint; hint stays lexicographically valid.
- [ ] **Step 3:** Implement methods on `Task`. No NestJS / Drizzle imports.

Acceptance: Domain specs green; counters computed from the in-memory collection match `checklistItemCount` and `checklistCheckedCount`.

---

## Task 2 — Checklist persistence (repository decision)

Decide: one `TaskRepository.persistChecklist(task)` that rewrites all items in a txn, vs. dedicated `ChecklistItemRepository` with item-level operations. Recommendation: **dedicated repository** for item-level writes and atomic counter maintenance.

- [ ] **Step 1:** `checklist-item.repository.ts` interface:
  - `addItem(taskId, item) → writes row AND updates task counters in same txn`.
  - `toggleItem(taskId, itemId, isChecked) → updates row + counter delta`.
  - `updateItem(taskId, itemId, title)`.
  - `removeItem(taskId, itemId) → deletes row + counter delta`.
  - `reorderItem(taskId, itemId, orderHint)`.
  - `listByTask(taskId)`.
- [ ] **Step 2:** Drizzle impl uses `db.transaction` per method. Counters updated with atomic `update ... set checklist_item_count = checklist_item_count + 1 ...` (no read-modify-write).
- [ ] **Step 3:** Integration spec: concurrent toggle of 5 items on the same task from 5 "clients" (simulated with `Promise.all` at the orchestrator level — not inside a handler) settles with correct final counters. This exercises the atomic counter update.

Acceptance: Under concurrent pressure the denormalized counters match reality. Integration spec passes.

---

## Task 3 — Checklist command handlers

Four handlers, one spec each (happy path, 20-cap, auth reject, concurrency conflict on task version, event emission):

- [ ] `add-checklist-item.handler.ts` — editor+; throws `ChecklistLimitReachedException` at 21st.
- [ ] `toggle-checklist-item.handler.ts` — editor+ OR viewer-assignee (because toggling is a progress-ish action, mirrors viewer-assignee exception). Optimistic concurrency on item's own `updatedAt` OR task's `updatedAt` — pick task-level for simplicity.
- [ ] `update-checklist-item.handler.ts` — editor+.
- [ ] `remove-checklist-item.handler.ts` — editor+.
- [ ] `reorder-checklist-item.handler.ts` — editor+; accepts `orderHintAfter`/`orderHintBefore`.

- [ ] **Integration spec:** a full `add → toggle → reorder → remove` cycle via tRPC with correct counter values at each step.

Acceptance: All handler specs green; counters correct; events emitted.

---

## Task 4 — `tasks.getDetail` query handler

- [ ] **Step 1:** Spec first. Fixture: task with 10 checklist items (5 checked), 3 assignees, 2 attachments (Plan 04 will actually create; for now return []), 4 comments (Plan 04, []), 1 evidence (Plan 04, []). Assertions:
  - Returns task with full `description`.
  - `checklist` sorted by `orderHint`.
  - `assignees` rich-resolved with display name + avatar.
  - `attachments`, `comments`, `evidence` are empty arrays at this stage.
  - Non-member → 404.
- [ ] **Step 2:** Implement. Two SQL queries: one for task + checklist join; one for assignee actor lookups via `PeopleQueryFacade`.
- [ ] **Step 3:** Expose at `tasks.getDetail`.

Acceptance: Integration spec passes. Response shape matches what the panel needs to render without extra fetches.

---

## Task 5 — Intercepting route scaffold

- [ ] **Step 1:** Create `apps/web-planner/src/app/plans/[planId]/board/tasks/[taskId]/page.tsx`. Next.js intercepting routes pattern:
  - Directory: `.../@panel/tasks/[taskId]/page.tsx` for the side-panel variant (consumed by `layout.tsx`'s `{panel}` slot).
  - Full-page variant: same route, normal file — rendered on direct URL.
- [ ] **Step 2:** Update `board/layout.tsx` to accept a `panel` slot and render it overlapping the right side when present.
- [ ] **Step 3:** Clicking a `TaskCard` uses `<Link href={\`/plans/\${planId}/board/tasks/\${taskId}\`}/>` — client navigation triggers the intercepting variant.
- [ ] **Step 4:** Closing the panel (Esc or × button) uses `router.back()`.

Acceptance: Click a card, panel slides in; Esc closes; direct URL hit renders full-page variant; browser back/forward works.

---

## Task 6 — `TaskDetailPanel` structure

- [ ] **Step 1:** Panel layout:
  - Header: title (inline editable, autosave on blur), × close button, "Saving…"/"Saved" indicator, progress pill dropdown, optimistic concurrency conflict banner (hidden by default).
  - `TaskPropertyStrip`: bucket selector, assignees (avatars + `AssigneePicker` trigger), priority dropdown, labels (`LabelPicker` trigger), start/due pickers. Each field autosaves on change/blur.
  - `TaskDescription`: plain-text autosize textarea; autosaves on blur; pastes strip formatting (see Task 10).
  - Sections: **Checklist** (full UX here), **Attachments** / **Comments** / **Evidence** — render placeholder "Coming in Phase 1.6 / 1.7 / 1.8" sections with disabled composers.
- [ ] **Step 2:** Component specs for each sub-component rendering correctly with fixture data.

Acceptance: Panel renders a task's full state from `useTaskDetail`; every field is visible.

---

## Task 7 — `useTaskDetail` autosave hook

- [ ] **Step 1:** Hook takes `taskId`; uses React Query for reads and per-field mutations.
- [ ] **Step 2:** Per-field autosave implementation:
  - Text fields (title, description): debounced 400 ms OR on blur, whichever first. Save calls `tasks.update` with `patch` containing only the changed field + `expectedVersion`.
  - Selects/pickers/dates: immediate on change.
- [ ] **Step 3:** State: `saving` (bool), `lastError` (null | Error), `conflict` (null | ServerTask). Exposed to panel header.
- [ ] **Step 4:** On `409 CONFLICT`:
  1. Refetch `tasks.getDetail`.
  2. Diff server state against local edits.
  3. If the conflicting field equals what the user is currently editing → invoke `useConflictResolver` (Task 8).
  4. Otherwise: silent merge (server's updates to other fields + user's pending edit wins for their field) + continue.
- [ ] **Step 5:** Spec with simulated tRPC: success, 409 on unrelated field (silent merge), 409 on the field being edited (invokes resolver).

Acceptance: Autosave feels invisible on happy path; conflicts never silently overwrite user work.

---

## Task 8 — `useConflictResolver` UI

- [ ] **Step 1:** When a same-field conflict occurs, the field in the panel renders dual inline bubbles:
  - "Your version: …" with a "Keep mine" button.
  - "Their version: …" with a "Keep theirs" button.
  - Third: "Merge manually" opens the field in an edit state showing both values for the user to compose.
- [ ] **Step 2:** Each decision triggers a new `tasks.update` with the resolved value + the refreshed `expectedVersion`. On a second conflict, repeat.
- [ ] **Step 3:** Component spec: render the resolver with both values, click "Keep mine", assert the right mutation is dispatched.

Acceptance: Conflicts resolve in ≤ 2 clicks; user never loses text they wrote.

---

## Task 9 — `TaskChecklist` component

- [ ] **Step 1:** Renders the ordered list; each item has a checkbox, editable title, drag handle.
- [ ] **Step 2:** Add-on-Enter: focused item, press Enter → creates new empty item beneath, focuses it. At 20 items, the "Add item" input is disabled with a visible hint: "Maximum 20 items (Microsoft Planner limit)".
- [ ] **Step 3:** Optimistic toggling on checkbox click; card's counter badge (read from board cache) updates in same React Query cache tick.
- [ ] **Step 4:** Drag reorder via vertical `@dnd-kit` sortable; on drop, call `checklist.reorder` with hint math.
- [ ] **Step 5:** "Show on card" — not in MS, SKIP per strict-lockstep rule (we only show counter, not item text, on cards).
- [ ] **Step 6:** Component specs covering each interaction.

Acceptance: Checklist feels as responsive as MS Planner's; cap is clearly communicated; drag reorder smooth.

---

## Task 10 — Rich-text paste handling

- [ ] **Step 1:** On description textarea paste event, intercept and write only `event.clipboardData.getData('text/plain')` into the field (never `text/html`).
- [ ] **Step 2:** If the clipboard included non-trivial HTML (detected by presence of `<` in raw HTML payload but absent in plain text), show a one-time toast: "Rich text is not supported — formatting was removed." Suppress for the rest of the session.
- [ ] **Step 3:** Component spec: simulate a paste with HTML; assert textarea receives plain text and toast shows once.

Acceptance: Users pasting from Word/Slack see plain content + explanation. No hidden HTML creeps into description.

---

## Task 11 — E2E flows

- [ ] Open a task → edit title → blur → refresh → persisted.
- [ ] Edit description (paste from rich source) → see toast → text is plain.
- [ ] Add 20 checklist items → 21st blocked with hint.
- [ ] Check 3 items → card counter shows 3/20.
- [ ] Trigger conflict (second browser edits same field); observe resolver UI.

Acceptance: All five pass locally and in CI.

---

## Deliverable

A reviewable PR that ships the task detail panel end-to-end with checklist. After merge, users can open any card, edit every field, manage the checklist, and resolve conflicts if two people edit at once. Attachments/comments/evidence tabs are still placeholder sections. Spec progress checkboxes updated for Phase 1.4 and 1.5.
