# Planner Task Detail — MS Planner Premium Parity Design

**Date:** 2026-05-05
**Branch:** `feat/planner-task-detail-ui-ux`
**Scope:** Clone MS Planner Premium Task Detail Modal UI/UX and feature set

---

## 1. Summary

The current task detail panel is a single scrolling pane where nearly all property fields (assignees, priority, labels, bucket, dates) are read-only. This is the biggest UX gap vs MS Planner. The panel also lacks Premium features: rich text, custom fields, dependencies, subtasks, sprint assignment, and task history.

This spec covers a two-phase implementation:

- **Phase 1** — pure frontend: tab restructure + inline-editable fields + Tiptap rich text + @mentions
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

Every tile/row is **inline-editable** on click. No "edit mode" toggle. Clicking a field opens the same picker already used on board cards (`AssigneePicker`, `LabelPicker`, `DatePicker`).

---

## 4. Phase 1 — Frontend Only

### 4.1 Tab Restructure

**File:** `apps/web-planner/src/components/task-detail/TaskDetailPanel.tsx`

Replace the current scrolling layout with a `Tabs` component (`@future/ui`). Each tab maps to its own sub-component:

- `TaskDetailTab.tsx` — Details tab content
- `TaskChecklistTab.tsx` — Checklist tab content (rename from `TaskChecklist.tsx`)
- `TaskFilesTab.tsx` — Files tab content (merge `TaskAttachments.tsx` + `TaskEvidence.tsx`)
- `TaskChatTab.tsx` — Chat tab content (rename from `TaskComments.tsx`)

`TaskPropertyStrip.tsx` is deleted and replaced by the inline-editable field grid in `TaskDetailTab.tsx`.

### 4.2 Inline-Editable Property Fields

All six property fields become editable directly in the Details tab. Reuse existing board card picker components — they already contain the correct mutations:

| Field      | Picker Component                                            | Mutation                                        |
| ---------- | ----------------------------------------------------------- | ----------------------------------------------- |
| Assignees  | `AssigneePicker`                                            | `trpc.planner.tasks.assign` / `unassign`        |
| Priority   | `PriorityPicker` (new, extracted from card menu)            | `trpc.planner.tasks.setPriority`                |
| Progress   | `ProgressPicker` (new dropdown)                             | `trpc.planner.tasks.setProgress`                |
| Start date | `DatePicker` (new, reuse HTML date input pattern from card) | `trpc.planner.tasks.setDates`                   |
| Due date   | `DatePicker`                                                | `trpc.planner.tasks.setDates`                   |
| Bucket     | `BucketPicker` (new dropdown of plan buckets)               | `trpc.planner.tasks.move`                       |
| Labels     | `LabelPicker`                                               | `trpc.planner.tasks.applyLabel` / `removeLabel` |

All pickers close on outside click or Escape. No mutations fire until a selection is made (no auto-save on open).

### 4.3 Rich Text Description

**Library:** Tiptap (`@tiptap/react`, `@tiptap/starter-kit`)

Replace the `<Textarea>` in `TaskDescription.tsx` with a Tiptap editor. Toolbar: **B** / _I_ / U / 🔗 / `</>`. Save on blur (same pattern as current textarea — call `trpc.planner.tasks.update` with `description`).

Backend already stores `description` as `varchar(32000)` — no schema change needed. Tiptap serialises to HTML; store as HTML string.

### 4.4 @Mentions in Chat

Add `@tiptap/extension-mention` to the chat composer in `TaskChatTab.tsx`. Mention suggestions query plan members. The mention renders as `@Name` in the comment body. No backend notification system is in scope — @mention is a visual UX pattern only. Push notifications for mentions are a separate infrastructure initiative (see out-of-scope table).

### 4.5 Conflict Banner

`ConflictBanner.tsx` moves into the panel header (above tabs), not inside a tab. It remains visible regardless of active tab.

---

## 5. Phase 2 — Full Stack

### 5.1 Custom Fields

**New DB tables (planner schema):**

```sql
plannerCustomFieldDef
  id, tenantId, planId, name, kind (text|number|date|yes_no|choice),
  choiceOptions (jsonb, array of {value, color}), position, createdAt

plannerTaskCustomFieldValue
  tenantId, taskId, fieldDefId, valueText, valueNumber, valueDate,
  valueYesNo, valueChoice, updatedAt
```

**tRPC procedures (planner.customFields router):**

- `defineField` — create field def on plan (max 10 per plan)
- `updateFieldDef` — rename, reorder, add/remove choice options
- `deleteFieldDef` — remove def + all values
- `setValue` — upsert task value for a field

**UI:**

- Custom Fields section at bottom of Details tab
- Each field renders as a full-width row: label (left) + editable value (right)
- Plan owners see a `+ Add field` button below the section
- Clicking field name opens field-def editor popover (rename, reorder, delete)
- Value types: plain text input, number input, date picker, yes/no toggle, choice dropdown

Custom field values are included in `trpc.planner.tasks.getDetail` response. Changes publish `TaskCustomFieldUpdated` domain event (for task history).

### 5.2 Task Dependencies

**New DB table:**

```sql
plannerTaskDependency
  id, tenantId, fromTaskId, toTaskId,
  kind (finish_to_start|start_to_start|finish_to_finish), createdBy, createdAt
```

**tRPC procedures (planner.dependencies router):**

- `addDependency` — link two tasks
- `removeDependency` — unlink

**UI:**

- Dependencies section in Details tab (below Sprint, above Custom Fields)
- Shows "Blocked by" and "Blocks" sub-sections
- Task search-picker to add a dependency (searches tasks in same plan by title)
- Each dep row: kind badge + task title + progress badge + remove button
- Circular dependency validation in command handler (return error if cycle detected)

### 5.3 Subtasks

**Schema change:** Add `parentTaskId uuid nullable references planner.plannerTask(id)` to `plannerTask`.

**New tRPC procedures:**

- `tasks.createSubtask` — create child task under a parent (inherits planId, bucketId)
- `tasks.getSubtasks` — list direct children of a task

**UI (Checklist tab — Subtasks section):**

- Shows direct children of the task
- Each subtask row: progress toggle + title + assignee avatar + due date + `⋯` menu
- `⋯` menu: open subtask detail, remove
- `+ Add subtask` creates a new task with `parentTaskId` set
- Clicking a subtask title replaces the current panel content with the subtask's detail view; a back arrow in the header returns to the parent task
- Max nesting: 1 level deep for Phase 2 (no multi-level WBS)

Subtask count shown in Checklist tab badge. Parent task card on board shows subtask progress fraction.

### 5.4 Sprint Assignment

**New DB table:**

```sql
plannerSprint
  id, tenantId, planId, name, startDate, endDate, createdBy, createdAt, completedAt
```

**Schema change on plannerTask:** Add `sprintId uuid nullable references planner.plannerSprint(id)`.

**tRPC procedures (planner.sprints router):**

- `create` — create sprint with name + date range
- `complete` — mark sprint done
- `list` — list sprints for plan (active + past)
- `assignTask` — set task.sprintId
- `unassignTask` — clear task.sprintId

**UI:**

- Sprint row in Details tab (below Labels)
- Dropdown picker lists active sprints for the plan + "No sprint" option
- Board view gains "Group by Sprint" option in a follow-up

### 5.5 Task History / Changes Pane

**New DB table:**

```sql
plannerTaskHistory
  id, tenantId, taskId, actorId, field, oldValue (jsonb), newValue (jsonb),
  changedAt
```

**Event listeners** record a history row on every domain event that mutates a task field. Mapping to existing + new events:

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

- `tasks.getHistory` — paginated list of history rows for a task, newest first

**UI:**

- 🕐 icon in panel header opens a slide-in changes pane (second panel to the right)
- Each row: actor avatar + human-readable description ("Changed Priority from Medium → Important") + relative timestamp
- Infinite scroll (cursor-based pagination, 20 items per page)

---

## 6. What Is Explicitly Out of Scope

| Feature                                       | Reason                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| Recurrence / repeating tasks                  | MS Basic-only feature; not in Premium                                     |
| Effort hours (completed/remaining/total)      | Not selected                                                              |
| Milestone toggle                              | Not selected                                                              |
| Multi-level subtask hierarchy (WBS > 1 level) | Phase 2 limited to 1 level                                                |
| Full notification system for @mentions        | Infrastructure work; separate initiative                                  |
| Sprint board grouping                         | Follow-up after sprint data model ships                                   |
| MS Planner sync for new fields                | Custom fields, dependencies, sprints are Future-only; no MS Graph mapping |
| Task templates                                | Out of scope                                                              |
| Bulk edit UI                                  | Out of scope                                                              |

---

## 7. Component Map — After Phase 1

```
TaskDetailPanel.tsx
  ├── TaskPanelHeader.tsx         (title + badges + history icon + close)
  ├── ConflictBanner.tsx          (moved to header area, above tabs)
  └── Tabs (Details / Checklist / Files / Chat)
       ├── TaskDetailTab.tsx       (replaces TaskPropertyStrip + TaskDescription)
       │    ├── AssigneesField     (uses AssigneePicker)
       │    ├── PriorityField      (uses PriorityPicker)
       │    ├── ProgressField      (uses ProgressPicker)
       │    ├── StartDateField     (uses DatePicker)
       │    ├── DueDateField       (uses DatePicker)
       │    ├── BucketField        (uses BucketPicker)
       │    ├── LabelsField        (uses LabelPicker)
       │    └── RichTextDescription (Tiptap)
       ├── TaskChecklistTab.tsx    (was TaskChecklist.tsx)
       ├── TaskFilesTab.tsx        (merges TaskAttachments + TaskEvidence)
       └── TaskChatTab.tsx         (was TaskComments.tsx, adds @mentions)
```

---

## 8. Design System Rules

Per `DESIGN.md` and `CLAUDE.md`:

- All interactive elements use `@future/ui` primitives (`Button`, `Input`, `Tabs`, `Popover`, etc.)
- No raw `<button>`, `<input>`, `<textarea>` for interactive elements
- Icons from `lucide-react` only
- Pending mutations show `<Spinner className="size-4" />` inside the relevant field tile
- No localStorage reads in component bodies (SSR safety)

---

## 9. Testing Requirements

Per CLAUDE.md TDD rules (≥70% coverage):

**Phase 1 (unit tests):**

- `PriorityPicker`, `ProgressPicker`, `BucketPicker` — render + select + mutation fired
- `RichTextDescription` — renders HTML content, saves on blur, strips on paste
- `TaskDetailTab` — all fields render with correct values from `getDetail` query

**Phase 2 (unit + integration):**

- `defineField` command handler — happy path + max-10 limit + invalid kind error
- `setValue` command handler — all 5 field types + task-not-found error
- `addDependency` — happy path + circular dependency detection
- `createSubtask` — happy path + parent-not-found error
- `getHistory` — pagination, newest-first ordering
- Integration tests against real DB for all new cross-table queries
