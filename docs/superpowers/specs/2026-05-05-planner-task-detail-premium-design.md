# Planner Task Detail — MS Planner Premium Parity Design

**Date:** 2026-05-05
**Branch:** `feat/planner-task-detail-ui-ux`
**Scope:** Clone MS Planner Premium Task Detail Modal UI/UX and feature set

---

## 1. Summary

The current task detail panel is a single scrolling pane where nearly all property fields
(assignees, priority, labels, bucket, dates) are read-only. This is the biggest UX gap vs MS
Planner. The panel also lacks Premium features: rich text, custom fields, dependencies,
subtasks, sprint assignment, and task history.

This spec covers a two-phase implementation:

- **Phase 1** — pure frontend: tab restructure + inline-editable fields + Tiptap rich text +
  @mentions
- **Phase 2** — full stack: custom fields, dependencies, subtasks, sprint, task history

---

## 2. Panel Structure

The task detail panel converts from a single scrolling pane to a **4-tab panel**:

| Tab           | Content                                                                   |
| ------------- | ------------------------------------------------------------------------- |
| **Details**   | All property fields + description + dependencies + custom fields + sprint |
| **Checklist** | Subtasks section (top) + simple checklist items (bottom)                  |
| **Files**     | Attachments + Evidence (merged under one tab)                             |
| **Chat**      | Comments with @mention support                                            |

The panel header (above tabs) contains:

- Editable task title (inline click-to-edit)
- "Add to My Day" badge
- MS Sync status badge
- 🕐 Task history icon (opens changes pane — Phase 2)
- ✕ Close button

Tab badges show counts: `Checklist 2`, `Files 3`.

---

## 3. Details Tab Layout

Mixed layout — compact pairs for dense numeric/status fields, full-width rows for list fields.

```
┌─────────────────────────────────────┐
│ Assignees (full-width, avatar stack + Add) │
├───────────────────┬─────────────────┤
│ Priority          │ Progress        │
├───────────────────┼─────────────────┤
│ Start date        │ Due date        │
├───────────────────┴─────────────────┤
│ Bucket (full-width row)             │
│ Labels (full-width row)             │
│ Sprint (full-width row) — Phase 2   │
├─────────────────────────────────────┤
│ Description (Tiptap rich text)      │
├─────────────────────────────────────┤
│ Dependencies — Phase 2              │
├─────────────────────────────────────┤
│ Custom Fields — Phase 2             │
└─────────────────────────────────────┘
```

Every tile/row is **inline-editable** on click. No "edit mode" toggle. Clicking a field opens
the same picker already used on board cards (`AssigneePicker`, `LabelPicker`, `DatePicker`).

---

## 4. Phase 1 — Frontend Only

### 4.0 What Ships

| Deliverable                                         | Description                                                          |
| --------------------------------------------------- | -------------------------------------------------------------------- |
| 4-tab panel shell                                   | Details / Checklist / Files / Chat — replaces the single scroll pane |
| Inline-editable property fields                     | All 7 fields clickable in Details tab (none remain read-only)        |
| `PriorityPicker` component                          | Extracted from card context menu; shared by panel + card             |
| `ProgressPicker` component                          | New 3-state dropdown                                                 |
| `BucketPicker` component                            | New plan-bucket dropdown                                             |
| `DatePicker` component                              | Reuses HTML date-input pattern from card; shared by panel + card     |
| Rich text description                               | Tiptap editor replaces plain textarea; saves as HTML string on blur  |
| @mention support in Chat tab                        | Visual pattern — `@Name` rendered inline; no push notifications      |
| ConflictBanner above tabs                           | Visible regardless of active tab                                     |
| `TaskPropertyStrip.tsx` deleted                     | Replaced entirely by `TaskDetailTab.tsx`                             |
| `TaskDescription.tsx` deleted                       | Replaced by `RichTextDescription` inside `TaskDetailTab.tsx`         |
| `TaskComments.tsx` → `TaskChatTab`                  | Rename + @mention extension                                          |
| `TaskChecklist.tsx` → `TaskChecklistTab`            | Rename only; logic unchanged                                         |
| `TaskAttachments` + `TaskEvidence` → `TaskFilesTab` | Merged under one tab                                                 |

No backend changes. No DB migrations. No new tRPC procedures.

### 4.1 Module Architecture

**Zone:** `apps/web-planner`

```
src/components/task-detail/
  TaskDetailPanel.tsx          ← root panel; owns tab state + task query
  TaskPanelHeader.tsx          ← title (inline edit) + badges + history icon + close
  ConflictBanner.tsx           ← unchanged; moved above <Tabs>
  tabs/
    TaskDetailTab.tsx          ← Details tab; replaces TaskPropertyStrip + TaskDescription
    TaskChecklistTab.tsx       ← renamed from TaskChecklist.tsx
    TaskFilesTab.tsx           ← merges TaskAttachments.tsx + TaskEvidence.tsx
    TaskChatTab.tsx            ← renamed from TaskComments.tsx; adds @mention extension
  fields/
    AssigneesField.tsx         ← wraps existing AssigneePicker
    PriorityField.tsx          ← new; wraps new PriorityPicker
    ProgressField.tsx          ← new; wraps new ProgressPicker
    DateField.tsx              ← new; wraps new DatePicker (used for start + due)
    BucketField.tsx            ← new; wraps new BucketPicker
    LabelsField.tsx            ← wraps existing LabelPicker
    RichTextDescription.tsx    ← new; Tiptap editor

src/components/pickers/
  AssigneePicker.tsx           ← already exists; no changes
  LabelPicker.tsx              ← already exists; no changes
  PriorityPicker.tsx           ← new; extracted from card context menu
  ProgressPicker.tsx           ← new
  DatePicker.tsx               ← new
  BucketPicker.tsx             ← new
```

**Deleted files:**

- `src/components/task-detail/TaskPropertyStrip.tsx`
- `src/components/task-detail/TaskDescription.tsx`
- `src/components/task-detail/TaskComments.tsx` (→ `TaskChatTab.tsx`)
- `src/components/task-detail/TaskChecklist.tsx` (→ `TaskChecklistTab.tsx`)
- `src/components/task-detail/TaskAttachments.tsx` (→ merged into `TaskFilesTab.tsx`)
- `src/components/task-detail/TaskEvidence.tsx` (→ merged into `TaskFilesTab.tsx`)

**Data flow:** `TaskDetailPanel` owns one `trpc.planner.tasks.getDetail` query and passes the
result down to each tab. Each field component calls its own mutation independently (no
coordinated save). The panel re-fetches after any mutation via query invalidation.

### 4.2 Inline-Editable Property Fields

All property fields become editable directly in the Details tab:

| Field      | Picker Component                                            | Mutation                                        |
| ---------- | ----------------------------------------------------------- | ----------------------------------------------- |
| Assignees  | `AssigneePicker`                                            | `trpc.planner.tasks.assign` / `unassign`        |
| Priority   | `PriorityPicker` (new, extracted from card menu)            | `trpc.planner.tasks.setPriority`                |
| Progress   | `ProgressPicker` (new dropdown)                             | `trpc.planner.tasks.setProgress`                |
| Start date | `DatePicker` (new, reuse HTML date input pattern from card) | `trpc.planner.tasks.setDates`                   |
| Due date   | `DatePicker`                                                | `trpc.planner.tasks.setDates`                   |
| Bucket     | `BucketPicker` (new dropdown of plan buckets)               | `trpc.planner.tasks.move`                       |
| Labels     | `LabelPicker`                                               | `trpc.planner.tasks.applyLabel` / `removeLabel` |

All pickers close on outside click or Escape. No mutations fire until a selection is confirmed
(no auto-save on open).

### 4.3 Rich Text Description

**Library:** Tiptap (`@tiptap/react`, `@tiptap/starter-kit`)

Replace the `<Textarea>` in `TaskDescription.tsx` with a Tiptap editor. Toolbar: **B** / _I_ /
U / 🔗 / `</>`. Save on blur (same pattern as current textarea — call
`trpc.planner.tasks.update` with `description`).

Backend already stores `description` as `varchar(32000)` — no schema change needed. Tiptap
serialises to HTML; stored as HTML string.

### 4.4 @Mentions in Chat

Add `@tiptap/extension-mention` to the chat composer in `TaskChatTab.tsx`. Mention suggestions
query plan members (`trpc.planner.plan.get` members list). The mention renders as `@Name` in the
comment body. No backend notification system is in scope — @mention is a visual UX pattern only.
Push notifications for mentions are a separate infrastructure initiative (see out-of-scope
table).

### 4.5 Conflict Banner

`ConflictBanner.tsx` moves into the panel header (above tabs), not inside a tab. It remains
visible regardless of active tab.

### 4.6 Locked Principles — Phase 1

1. **No new tRPC procedures.** Every mutation already exists. Phase 1 wires the UI to existing
   API surface only.
2. **No DB migrations.** Phase 1 ships zero schema changes.
3. **Picker components are shared.** `PriorityPicker`, `BucketPicker`, `ProgressPicker`,
   `DatePicker` live in `src/components/pickers/` and are used by both the panel fields and the
   board card context menu. Never duplicate picker logic.
4. **No auto-save on field open.** Mutations fire only on explicit selection/confirm. Escape
   discards.
5. **SSR safety.** No `window`, `localStorage`, or `sessionStorage` reads in component bodies or
   `useState` initialisers. URL state via `useSearchParams()`. Client storage via
   `useSyncExternalStore`.
6. **Design system only.** All interactive elements via `@future/ui` primitives. No raw
   `<button>`, `<input>`, `<textarea>`. Icons from `lucide-react` only.
7. **TDD — test first.** New picker components need tests before implementation. ≥70% coverage
   required.

---

## 5. Phase 2 — Full Stack

### 5.0 What Ships

| Deliverable                 | Backend                                                                                        | Frontend                                                       |
| --------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Custom fields               | 2 new DB tables + `customFields` tRPC router (4 procs)                                         | Custom Fields section in Details tab; field-def editor popover |
| Task dependencies           | 1 new DB table + `dependencies` tRPC router (2 procs)                                          | Dependencies section in Details tab; task search-picker        |
| Subtasks                    | `parentTaskId` on `plannerTask` + 2 new tRPC procs                                             | Subtasks section at top of Checklist tab; replace-in-place nav |
| Sprint assignment           | 1 new DB table + `sprints` tRPC router (5 procs); `sprintId` on `plannerTask`                  | Sprint row in Details tab; sprint picker dropdown              |
| Task history / changes pane | 1 new DB table + event listeners (11 events) + 1 new tRPC proc                                 | 🕐 icon in header; slide-in changes pane                       |
| Domain events (new)         | `TaskCustomFieldUpdated`, `TaskSprintAssigned`, `TaskDependencyAdded`, `TaskDependencyRemoved` | —                                                              |
| `getDetail` query updated   | Returns custom field values, subtask count, sprint, dependencies                               | All new sections hydrated from existing query call             |

### 5.1 Module Architecture

**Backend:** `apps/api/src/modules/planner/`

Each new capability follows the existing hexagonal + DDD layout:

```
modules/planner/
  domain/
    entities/
      CustomFieldDef.ts        ← new entity (planId-scoped, up to 10)
      Sprint.ts                ← new entity
    value-objects/
      CustomFieldKind.ts       ← text|number|date|yes_no|choice
      DependencyKind.ts        ← finish_to_start|start_to_start|finish_to_finish
    repositories/
      ICustomFieldDefRepository.ts   ← new port
      ITaskDependencyRepository.ts   ← new port
      ISprintRepository.ts           ← new port
      ITaskHistoryRepository.ts      ← new port
  application/
    commands/
      DefineCustomField.command.ts
      UpdateCustomFieldDef.command.ts
      DeleteCustomFieldDef.command.ts
      SetCustomFieldValue.command.ts
      AddDependency.command.ts
      RemoveDependency.command.ts
      CreateSubtask.command.ts
      CreateSprint.command.ts
      CompleteSprint.command.ts
      AssignTaskToSprint.command.ts
      UnassignTaskFromSprint.command.ts
    queries/
      GetSubtasks.query.ts
      GetHistory.query.ts
      ListSprints.query.ts
    event-handlers/
      TaskHistoryRecorder.handler.ts  ← listens to 11 events; writes plannerTaskHistory rows
  infrastructure/
    schema/
      custom-field-def.table.ts
      task-custom-field-value.table.ts
      task-dependency.table.ts
      sprint.table.ts
      task-history.table.ts
    repositories/
      CustomFieldDefRepository.ts
      TaskDependencyRepository.ts
      SprintRepository.ts
      TaskHistoryRepository.ts
  interface/trpc/
    custom-fields.router.ts
    dependencies.router.ts
    sprints.router.ts
    (task.router.ts updated: +createSubtask, +getSubtasks, +getHistory)
```

**Frontend:** `apps/web-planner/src/components/task-detail/`

```
tabs/
  TaskDetailTab.tsx           ← adds Sprint row, Dependencies section, Custom Fields section
  TaskChecklistTab.tsx        ← adds Subtasks section above existing checklist
fields/
  SprintField.tsx             ← new; wraps SprintPicker
  DependenciesSection.tsx     ← new; task search-picker + dep rows
  CustomFieldsSection.tsx     ← new; dynamic renderer + field-def editor
  SubtasksSection.tsx         ← new; child task list + add + replace-in-place nav
pickers/
  SprintPicker.tsx            ← new
  TaskSearchPicker.tsx        ← new; searches tasks in plan by title (used by deps)
panels/
  TaskHistoryPane.tsx         ← new; slide-in pane opened by 🕐 icon
```

### 5.2 Custom Fields

**New DB tables (planner schema):**

```sql
plannerCustomFieldDef
  id, tenantId, planId, name, kind (text|number|date|yes_no|choice),
  choiceOptions (jsonb, array of {value, color}), position, createdAt

plannerTaskCustomFieldValue
  tenantId, taskId, fieldDefId, valueText, valueNumber, valueDate,
  valueYesNo, valueChoice, updatedAt
```

**tRPC procedures (`planner.customFields` router):**

- `defineField` — create field def on plan (max 10 per plan)
- `updateFieldDef` — rename, reorder, add/remove choice options
- `deleteFieldDef` — remove def + cascade-delete all values
- `setValue` — upsert task value for a field

**UI:**

- Custom Fields section at bottom of Details tab
- Each field: full-width row, label left, editable value right
- Plan owners see `+ Add field` below the section
- Clicking a field label opens a field-def editor popover (rename, reorder, delete)
- Value input per kind: plain text, number input, date picker, yes/no toggle, choice dropdown

Custom field values included in `trpc.planner.tasks.getDetail` response. Changes publish
`TaskCustomFieldUpdated` domain event (consumed by `TaskHistoryRecorder`).

### 5.3 Task Dependencies

**New DB table:**

```sql
plannerTaskDependency
  id, tenantId, fromTaskId, toTaskId,
  kind (finish_to_start|start_to_start|finish_to_finish), createdBy, createdAt
```

`fromTaskId` is the **predecessor** (must finish/start first); `toTaskId` is the **successor**.
"Blocked by" for task T = rows where `toTaskId = T`. "Blocks" for task T = rows where
`fromTaskId = T`.

**tRPC procedures (`planner.dependencies` router):**

- `addDependency` — link predecessor → successor with kind
- `removeDependency` — unlink by id

**UI:**

- Dependencies section in Details tab (below Sprint, above Custom Fields)
- Shows "Blocked by" and "Blocks" sub-sections
- `TaskSearchPicker` searches tasks in the same plan by title
- Each dep row: kind badge + task title + progress badge + remove button
- Circular dependency validation in command handler (DFS cycle check); returns a typed error

### 5.4 Subtasks

**Schema change:** Add `parentTaskId uuid nullable references planner.plannerTask(id)` to
`plannerTask`.

**New tRPC procedures:**

- `tasks.createSubtask` — create child task under a parent (inherits `planId`, `bucketId`)
- `tasks.getSubtasks` — list direct children of a task (ordered by `orderHint`)

**UI (Checklist tab — Subtasks section):**

- Subtasks section rendered above the existing Checklist section (dashed divider separates them)
- Each subtask row: progress toggle + title + assignee avatar + due date + `⋯` menu
- `⋯` menu options: open detail, remove
- Clicking a subtask title **replaces** the current panel content with the subtask's detail view;
  a back arrow (`←`) in the header returns to the parent task
- `+ Add subtask` creates a new task with `parentTaskId` set
- Max nesting: 1 level deep for Phase 2 (no multi-level WBS)
- Checklist tab badge shows total subtask count; parent task board card shows subtask progress
  fraction (e.g. `1/3`)

### 5.5 Sprint Assignment

**New DB table:**

```sql
plannerSprint
  id, tenantId, planId, name, startDate, endDate, createdBy, createdAt, completedAt
```

**Schema change on `plannerTask`:** Add `sprintId uuid nullable references
planner.plannerSprint(id)`.

**tRPC procedures (`planner.sprints` router):**

- `create` — create sprint with name + date range
- `complete` — mark sprint done (sets `completedAt`)
- `list` — list sprints for plan (active + completed)
- `assignTask` — set `task.sprintId`
- `unassignTask` — clear `task.sprintId`

**UI:**

- Sprint row in Details tab (below Labels)
- `SprintPicker` dropdown lists active sprints for the plan + "No sprint" option
- Creating a sprint accessible via a `+ New sprint` entry in the picker dropdown
- Board view "Group by Sprint" is a follow-up ticket; not in this phase

### 5.6 Task History / Changes Pane

**New DB table:**

```sql
plannerTaskHistory
  id, tenantId, taskId, actorId, field, oldValue (jsonb), newValue (jsonb),
  changedAt
```

**Event listeners** (`TaskHistoryRecorder` handler) write one row per mutated field:

| Event                    | Fields captured                                  |
| ------------------------ | ------------------------------------------------ |
| `TaskUpdated`            | title, description, priority, startDate, dueDate |
| `TaskProgressSet`        | progress                                         |
| `TaskMoved`              | bucketId                                         |
| `TaskAssigned`           | assignees (added)                                |
| `TaskUnassigned`         | assignees (removed)                              |
| `TaskLabelApplied`       | labels (added)                                   |
| `TaskLabelRemoved`       | labels (removed)                                 |
| `TaskCustomFieldUpdated` | custom field name + value                        |
| `TaskSprintAssigned`     | sprintId                                         |
| `TaskDependencyAdded`    | dependency kind + peer taskId                    |
| `TaskDependencyRemoved`  | dependency kind + peer taskId                    |

**tRPC procedure:**

- `tasks.getHistory` — paginated list of history rows for a task, newest first (cursor-based,
  20/page)

**UI:**

- 🕐 icon in panel header opens `TaskHistoryPane` — a slide-in panel to the right of the task
  detail
- Each row: actor avatar + human-readable description ("Changed Priority from Medium →
  Important") + relative timestamp
- Infinite scroll via cursor pagination

### 5.7 Locked Principles — Phase 2

1. **DDD module boundaries.** All new DB tables, repositories, commands, and queries live inside
   `modules/planner/`. No cross-module DB imports.
2. **Sequential DB queries in handlers.** Never use `Promise.all` for DB queries inside command
   or query handlers. The request-bound `DB_TOKEN` is a single `pg.PoolClient` — concurrent
   queries will queue or throw. Always `await` sequentially.
3. **No FK constraints across schema boundaries.** `plannerTaskDependency.fromTaskId` /
   `toTaskId` reference `planner.plannerTask` — same schema, FK is fine. No FKs to other module
   schemas.
4. **One migration file only.** Per CLAUDE.md: squash all schema changes into `0000_initial.sql`.
   No new numbered migration files. Procedure: update Drizzle schema → delete existing `.sql` +
   `meta/` → `bun run db:generate --name initial` → `bun run db:down -v && bun run db:up && bun
run db:migrate`.
5. **Domain events for every mutation.** Each new command publishes a domain event in
   `packages/event-contracts`. `TaskHistoryRecorder` subscribes to these; do not write history
   rows directly from command handlers.
6. **Exports from module root only.** `planner.module.ts` exports `PlannerQueryFacade` only.
   New query methods (`getSubtasks`, `getHistory`, `listSprints`) are added to the facade; new
   repositories are never exported.
7. **TDD — test first.** Every new command handler needs a passing test before implementation.
   Integration tests for all new cross-table queries. ≥70% coverage.

---

## 6. What Is Explicitly Out of Scope

| Feature                                       | Reason                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| Recurrence / repeating tasks                  | MS Basic-only feature; not in Premium                                     |
| Effort hours (completed/remaining/total)      | Deferred — not selected during design                                     |
| Milestone toggle                              | Deferred — not selected during design                                     |
| Multi-level subtask hierarchy (WBS > 1 level) | Phase 2 limited to 1 level deep; deeper nesting is a separate initiative  |
| Full notification system for @mentions        | Infrastructure work; separate initiative                                  |
| Sprint board grouping (Group by Sprint)       | Follow-up after sprint data model ships                                   |
| MS Planner sync for new fields                | Custom fields, dependencies, sprints are Future-only; no MS Graph mapping |
| Task templates                                | Out of scope                                                              |
| Bulk edit UI                                  | Out of scope                                                              |

---

## 7. Component Map — After Phase 1

```
TaskDetailPanel.tsx
  ├── TaskPanelHeader.tsx              (title + badges + history icon + close)
  ├── ConflictBanner.tsx               (moved above tabs; always visible)
  └── Tabs (Details / Checklist / Files / Chat)
       ├── TaskDetailTab.tsx           (replaces TaskPropertyStrip + TaskDescription)
       │    ├── AssigneesField         (→ AssigneePicker)
       │    ├── PriorityField          (→ PriorityPicker)
       │    ├── ProgressField          (→ ProgressPicker)
       │    ├── DateField ×2           (→ DatePicker, start + due)
       │    ├── BucketField            (→ BucketPicker)
       │    ├── LabelsField            (→ LabelPicker)
       │    └── RichTextDescription    (Tiptap)
       ├── TaskChecklistTab.tsx        (was TaskChecklist.tsx)
       ├── TaskFilesTab.tsx            (merges TaskAttachments + TaskEvidence)
       └── TaskChatTab.tsx             (was TaskComments.tsx; adds @mention)
```

---

## 8. Design System Rules

Per `DESIGN.md` and `CLAUDE.md`:

- All interactive elements use `@future/ui` primitives (`Button`, `Input`, `Tabs`, `Popover`,
  etc.)
- No raw `<button>`, `<input>`, `<textarea>` for interactive elements
- Icons from `lucide-react` only
- Pending mutations: `<Spinner className="size-4" />` inside the relevant field tile
- No `window`, `localStorage`, or `sessionStorage` reads in component bodies or `useState`
  initialisers

---

## 9. Testing Requirements

Per CLAUDE.md TDD rules (≥70% coverage):

**Phase 1 (unit tests, co-located):**

- `PriorityPicker`, `ProgressPicker`, `BucketPicker` — render + select + mutation called
- `RichTextDescription` — renders HTML content, saves on blur, strips on paste
- `TaskDetailTab` — all 7 fields render correct values from `getDetail` query result

**Phase 2 (unit + integration):**

- `DefineCustomField` command — happy path + max-10 limit error + invalid kind error
- `SetCustomFieldValue` command — all 5 field types + task-not-found error
- `AddDependency` command — happy path + circular dependency detection
- `CreateSubtask` command — happy path + parent-not-found error
- `GetHistory` query — pagination correctness, newest-first ordering
- `TaskHistoryRecorder` handler — records correct old/new values for each of the 11 events
- Integration tests against real DB for all new cross-table queries

---

## 10. Research & References

### MS Planner Official Documentation

- [Advanced capabilities with premium plans in Planner](https://support.microsoft.com/en-gb/office/advanced-capabilities-with-premium-plans-in-planner-6cdba2aa-da06-4e08-be4c-baaa4fda17ba)
- [Compare Microsoft Planner basic vs. premium plans](https://support.microsoft.com/en-us/office/compare-microsoft-planner-basic-vs-premium-plans-5e351170-4ed5-43dc-bf30-d6762f5a6968)
- [Microsoft Planner Plans and Pricing](https://www.microsoft.com/en-us/microsoft-365/planner/microsoft-planner-plans-and-pricing)
- [Recurring tasks in Planner](https://support.microsoft.com/en-gb/office/recurring-tasks-in-planner-9f2561ee-45ee-4834-955b-c457f8bb0490)
- [Attach files, photos, or links to a task in Planner](https://support.microsoft.com/en-us/office/attach-files-photos-or-links-to-a-task-52c688e1-aeb0-4b49-8d78-42984cd553f7)
- [Using suggested attachments in Microsoft Planner](https://support.microsoft.com/en-us/office/using-suggested-attachments-in-microsoft-planner-867cff77-b866-4110-b59d-d13e3e6689d6)

### MS Planner Blog & Community

- [Introducing a refreshed design, task chat, and more in Microsoft Planner](https://techcommunity.microsoft.com/blog/plannerblog/introducing-a-refreshed-design-task-chat-and-more-in-microsoft-planner/4495440)
- [Collaborate confidently with Task History in Microsoft Planner](https://techcommunity.microsoft.com/blog/plannerblog/collaborate-confidently-with-task-history-in-microsoft-planner/4178829)
- [Create a custom field in the new Microsoft Planner](https://techcommunity.microsoft.com/blog/plannerblog/create-a-custom-field-in-the-new-microsoft-planner/4194187)
- [Use sprints to be more Agile in Planner](https://techcommunity.microsoft.com/blog/plannerblog/use-sprints-to-be-more-agile-in-planner/4213240)
- [From overwhelmed to organized: How subtasks transform project management](https://techcommunity.microsoft.com/blog/plannerblog/from-overwhelmed-to-organized-how-subtasks-transform-project-management/4157428)
- [What's new in Microsoft Planner – May 2025](https://techcommunity.microsoft.com/blog/plannerblog/what%E2%80%99s-new-in-microsoft-planner-%E2%80%93-may-2025/4418488)
- [What's new in Microsoft Planner – August 2025](https://techcommunity.microsoft.com/blog/plannerblog/what%E2%80%99s-new-in-microsoft-planner-%E2%80%93-august-2025/4449301)

### Third-Party Analysis

- [Unboxing the New Microsoft Planner — Sensei Project Solutions](https://www.senseiprojectsolutions.com/unboxingthenewplanner)
- [Microsoft Planner Premium — Holert](https://www.holert.com/en/blog/microsoft-planner-premium)
- [Task History — Apps4.Pro](https://blog.apps4.pro/microsoft-planner-task-history)
- [Microsoft Planner 2026 New and Retiring Features — Sourcepass](https://sourcepassmcoe.com/articles/microsoft-planner-2026-new-and-retiring-features-sourcepass-mcoe)
- [Rich text and images in Planner task notes — SuperSimple365](https://supersimple365.com/rich-text-and-images-in-planner-task-notes/)

---

## 11. Decision Log

Decisions made during the design session on 2026-05-05.

---

### DL-01: Tabbed panel over single-scroll

**Decision:** Convert the task detail panel to a 4-tab layout (Details / Checklist / Files /
Chat) matching the MS Planner 2026 refresh.

**Alternatives considered:**

- _A — Keep single scroll with inline-editable fields_: Closer to MS Planner 2024 style.
  Simpler refactor. Rejected because it doesn't scale with Phase 2 additions (custom fields,
  dependencies, history); the pane would become very long.
- _B — Single scroll, editable_ (Option B in mockup): Rejected in favour of tabs.
- _C — Tabs_ (chosen): Maps each concern to its own tab. Scales cleanly as new Phase 2 sections
  are added to Details without increasing scroll length.

**Trade-off accepted:** Users can no longer see checklist and task details simultaneously (same
criticism MS received when they shipped tabs). Accepted as the right long-term architecture.

---

### DL-02: Mixed layout for Details tab properties

**Decision:** Property fields use a mixed layout — 2-column compact pairs for priority/progress
and start/due dates; full-width rows for assignees, bucket, labels, sprint.

**Alternatives considered:**

- _A — Pure 2-column grid_: Most compact; exact MS Planner match. Rejected because assignee
  avatars and label pills need horizontal space that a half-width tile doesn't provide well.
- _B — Full-width rows for everything_: Most readable. Rejected as too tall — wastes vertical
  space for simple scalar fields.
- _C — Mixed_ (chosen): Priority/Progress and Start/Due are short scalar values that pair
  naturally. Assignees, bucket, and labels are list-like and benefit from full width.

---

### DL-03: Two-phase delivery over one big sprint or thin slices

**Decision:** Phase 1 (pure frontend, no DB) ships first; Phase 2 (full stack, 5 new features)
follows in the next sprint.

**Alternatives considered:**

- _One big sprint_: Complete parity in a single branch. Rejected — estimated 3–4 weeks of work,
  high merge risk, blocks other planner work.
- _Thin vertical slices (7 PRs)_: One PR per feature. Rejected as overhead-heavy; tabs+inline
  editing is a prerequisite for all other PRs anyway, creating hard sequencing.
- _Two phases_ (chosen): Phase 1 ships the most visible UX fix (read-only panel) with zero
  backend risk in days. Phase 2 handles all new backend surface area independently.

---

### DL-04: Keep both subtasks and checklist items (not replace)

**Decision:** The Checklist tab shows a Subtasks section (top) and a simple Checklist section
(bottom), separated by a dashed divider. Both coexist.

**Alternatives considered:**

- _Replace checklist with subtasks entirely_: Simpler model. Rejected because it requires a data
  migration (all existing checklist items must become subtasks) and removes the lightweight
  "quick todo" UX that checklist items provide. MS Planner itself keeps both concepts.
- _Both coexist_ (chosen): No migration risk. Matches MS Planner's own model exactly. Users can
  choose the right tool for the weight of the sub-item.

---

### DL-05: Premium features selected for Phase 2

**Decision:** Phase 2 includes custom fields, task dependencies, subtasks, sprint assignment, and
task history. Effort hours, milestone toggle, and recurrence were excluded.

**Rationale per excluded item:**

- _Effort hours_: Useful for time-tracking but requires discipline to keep up-to-date manually.
  Deferred; can be added as a small DB patch later.
- _Milestone toggle_: Low signal-to-noise for a task management tool vs a project scheduling
  tool. Deferred.
- _Recurrence_: MS treats this as a **Basic-only** feature, not Premium. Not in scope for a
  Premium parity sprint.

---

### DL-06: @mentions are visual-only in Phase 1

**Decision:** @mention syntax is rendered in the Chat tab composer but no push notifications are
wired up.

**Rationale:** A full notification infrastructure (WebSocket/SSE, in-app notification centre,
email digest) is a cross-cutting concern owned by a separate initiative. Shipping @mention
rendering as a visual pattern in Phase 1 unblocks the UX improvement without blocking on
notification infra.
