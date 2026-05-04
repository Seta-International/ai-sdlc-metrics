# Planner Board Polish — Design Spec

**Date:** 2026-05-04  
**Scope:** `apps/web-planner` — board view UI, drag-and-drop wiring, mutation bug fixes  
**Delivery:** Single PR, Approach A (all changes together)

---

## 1. Overview

Six visual gaps vs the design spec, two confirmed bugs, and two drag-and-drop features that are structurally wired but not connected to the API. All changes are co-located in `apps/web-planner/src/components/board/` and the board page.

### What Ships in This Plan

| Category        | Item                                                                             |
| --------------- | -------------------------------------------------------------------------------- |
| **UI**          | Add Task button — full-width dashed style                                        |
| **UI**          | Progress icon — dashed not-started, amber in-progress, dark checkmark            |
| **UI**          | Priority icon — four semantically distinct shapes per level                      |
| **UI**          | Empty bucket state — placeholder with copy and kanban icon                       |
| **UI**          | Column header — always-visible grip, `+` shortcut, name as `<span>`              |
| **Bug fix**     | Stale `expectedVersion` on rapid priority / due date / label mutations (409 fix) |
| **Bug fix**     | Due date `onChange` fires mid-input → switched to `onBlur`                       |
| **DnD wiring**  | Column reorder — connected to `trpc.planner.buckets.reorder` API                 |
| **DnD verify**  | Same-bucket task reorder — persists after page refresh (existing logic checked)  |
| **API (minor)** | `setPriority`, `setDates`, `applyLabel`, `removeLabel` return `{ updatedAt }`    |

Does **not** ship: MS Planner sync for column order, task detail panel progress cycling, any changes outside `web-planner` or the `planner` API module.

---

### Locked Principles

These constraints are non-negotiable for this PR:

1. **TDD — tests before implementation.** Every behavioral change has a failing test written first. No test = feature not started.
2. **No design-system changes.** The `@future/ui` package is not touched. Local styling stays local to `web-planner`.
3. **No backward-compat shims.** Callers are updated; old interfaces are not preserved.
4. **Optimistic-first mutations.** Every mutation patches the cache before the API call; rollback on failure. No loading spinners for inline edits.
5. **Single `DndContext`.** Columns and tasks share one `DndContext` in `BoardDragContext`. Nesting two drag contexts is not supported by @dnd-kit.
6. **No cross-module imports.** `web-planner` talks to `apps/api` only via tRPC. No direct imports from `apps/api` domain or infrastructure paths.

---

### Module Architecture

```
apps/web-planner/src/
│
├── app/plans/[id]/board/
│   └── page.tsx                ← Board page: SortableContext for columns,
│                                  handleReorderColumn, passes props to BoardDragContext
│
├── components/board/
│   ├── BoardDragContext.tsx    ← Single DndContext: detects col-* vs task drags,
│   │                              dispatches onMove or onReorderColumn
│   ├── BoardColumn.tsx         ← Column: header layout, empty state, lifts QuickAddTask open state
│   ├── QuickAddTask.tsx        ← Controlled open/onOpenChange props + restyled closed button
│   └── TaskCard.tsx            ← Progress toggle always visible; updatedAt cache fix; localDate
│
├── components/primitives/
│   ├── ProgressIcon.tsx        ← Visual-only: dashed/amber/dark-checkmark per progress value
│   └── PriorityIcon.tsx        ← Visual-only: 4 distinct SVG shapes per priority level
│
└── components/labels/
    └── LabelPicker.tsx         ← updatedAt cache write after applyLabel/removeLabel

apps/api/src/modules/planner/application/commands/tasks/
    ├── set-task-priority.handler.ts   ← returns { updatedAt }
    ├── set-task-dates.handler.ts      ← returns { updatedAt }
    ├── apply-label.handler.ts         ← returns { updatedAt }
    └── remove-label.handler.ts        ← returns { updatedAt }
```

Data flows through this plan:

- **Drag end** → `BoardDragContext.handleDragEnd` → detects prefix → calls `onMove` (task) or `onReorderColumn` (column) → optimistic cache patch → API mutation → `invalidateQueries`
- **Inline edit** (priority / due date / label) → optimistic cache patch → API mutation → write `updatedAt` to cache → `invalidateQueries`
- **Progress toggle** → `onToggleComplete` on `BoardColumn` → `handleToggleComplete` in board page → `setProgress` mutation (existing flow, no change)

---

## 2. UI Changes

### 2.1 Add Task Button (`QuickAddTask.tsx`)

**Current:** Ghost `<Button>` with no background or border, left-aligned, narrow.

**Target:** Full-width button with:

- `background: rgba(255,255,255,0.015)`
- `border: 1px dashed rgba(255,255,255,0.10)`
- `border-radius: 7px`
- Color: `#62666d` (fg-muted)
- Font size: 11px
- Sits above the task list (position unchanged — before the droppable zone)

Implementation: Replace `<Button variant="ghost">` in the closed state with a raw `<button>` styled to match, or add a `variant="dashed"` to the design system. Prefer a local styled element to avoid touching the shared design system for a single use case.

---

### 2.2 Progress / Status Icon (`ProgressIcon.tsx`)

**Current state mapping:**

| Value | Appearance                                  | Visibility         |
| ----- | ------------------------------------------- | ------------------ |
| 0     | Solid stroke circle, `text-fg-muted` (gray) | Hidden until hover |
| 50    | Half-filled circle, brand purple            | Always visible     |
| 100   | Filled emerald circle + checkmark           | Always visible     |

**Target state mapping:**

| Value | Appearance                                       | Visibility         |
| ----- | ------------------------------------------------ | ------------------ |
| 0     | **Dashed** stroke circle, `#62666d`              | **Always visible** |
| 50    | Half-filled circle, **amber `#f59e0b`**          | Always visible     |
| 100   | Filled `#10b981` circle + checkmark, dark stroke | Always visible     |

Changes to `ProgressIcon.tsx`:

- Progress 0: add `strokeDasharray="2 2"` to the circle; change color from `text-fg-muted` token to literal `#62666d`.
- Progress 50: change color from `text-brand` token to `#f59e0b` (amber).
- Progress 100: checkmark stroke from `white` to `#0a0a0b` (matches dark canvas).

Changes to `TaskCard.tsx`:

- Remove `opacity-0 group-hover:opacity-100 transition-opacity` from the progress toggle `<Button>`.
- Progress toggle still fires only 0 ↔ 100 (skip 50). In-progress (50) is set from the task detail panel only.

---

### 2.3 Priority Icon (`PriorityIcon.tsx`)

Replace the signal-bar icon (uniform shape across all levels) with semantically distinct icons per level, matching the design spec:

| Level         | Icon                                       | Colors                                         |
| ------------- | ------------------------------------------ | ---------------------------------------------- |
| 1 — Low       | 2 filled bars + 1 dim bar (3-bar chart)    | `#62666d` filled, `rgba(138,143,152,0.25)` dim |
| 3 — Normal    | Horizontal dash line                       | `#8a8f98`                                      |
| 5 — Important | 3 bars fully filled                        | `#d0d6e0`                                      |
| 9 — Urgent    | Amber filled square (`rx=2`) with `!` path | Fill `#f59e0b`, stroke `#0a0a0b`               |

SVG viewBox remains `0 0 12 12`. The `PriorityIcon` component is local to `web-planner` so this change has no cross-zone impact.

The `TaskCard` only renders the priority icon when `task.priority === 9` (urgent) — this behavior is correct per design and unchanged.

---

### 2.4 Empty Bucket State (`BoardColumn.tsx`)

**Current:** When `bucket.tasks.length === 0`, the droppable zone renders a `min-h-12` transparent div — invisible to the user.

**Target:** Render a dashed placeholder inside the drop zone when empty:

```
┌─────────────────────────────────┐
│   [kanban icon]                 │
│   Nothing to review             │
│   Drop a task here, or it'll    │
│   arrive when someone moves     │
│   it along.                     │
└─────────────────────────────────┘
```

Specifics:

- Container: `border: 1px dashed rgba(255,255,255,0.06)`, `border-radius: 8px`, `min-height: 80px`, flex column centered, `padding: 16px`
- Small kanban SVG icon in a `28×28` rounded container, color `#3e3e44`
- Title: **"Nothing to review"**, `font-size: 12px`, `font-weight: 510`, `color: #3e3e44`
- Description: **"Drop a task here, or it'll arrive when someone moves it along."**, `font-size: 11px`, `color: #3e3e44`, `text-align: center`, `max-width: 180px`
- On `isOver` (drag hover): existing ring highlight replaces the empty state (current behavior, no change needed)

Condition: render inside the `SortableContext` wrapper when `bucket.tasks.length === 0`.

---

### 2.5 Column Header (`BoardColumn.tsx`)

**Current:** Drag handle is a ghost `<Button>` (hover-only opacity), name is a clickable `<Button>` that opens rename.

**Target:**

- Drag handle: always visible at `color: #62666d` (not opacity-gated). The `{...colAttributes}` and `{...colListeners}` stay on the grip element.
- Column name: rendered as plain `<span>` (not a button). Double-click or single-click opens rename (keep current UX — a single click on the name still triggers rename via the existing onClick).
- Add a `+` icon button as a shortcut to expand `QuickAddTask` (calls `handleOpen` on the QuickAddTask component via a shared state or a callback prop).
- Three-dot menu: unchanged.

Header layout (left to right): `[grip] [name] [count] [spacer] [+] [⋯]`

For the `+` shortcut: lift `open` state out of `QuickAddTask` into `BoardColumn` so the header `+` button can trigger it directly. Pass `open` and `setOpen` as props to `QuickAddTask`, or expose an imperative `open()` ref. Prefer prop approach to avoid `useImperativeHandle`.

---

## 3. Bug Fixes

### 3.1 Stale `expectedVersion` on Rapid Successive Mutations

**Root cause:** `handleSetPriority`, `handleSetDueDate`, and `LabelPicker.handleToggle` all read `task.updatedAt` from the cached `BoardSnapshot` to build `expectedVersion`. The optimistic update patches task fields (priority, dueDate, appliedLabels) but does **not** update `updatedAt`. The server bumps `updatedAt` on every mutation. If the user makes two changes before `invalidateQueries` completes the refetch, the second mutation sends a stale `expectedVersion` and the server returns 409.

**Fix:** After each mutation succeeds, immediately write the server-returned `updatedAt` into the board cache before calling `invalidateQueries`. If the mutation response doesn't return `updatedAt`, write `new Date()` as an approximation (close enough to prevent same-session conflicts).

Pattern (applies to `handleSetPriority`, `handleSetDueDate` in `TaskCard.tsx`, and `handleToggle` in `LabelPicker.tsx`):

```ts
const result = await trpc.planner.tasks.setPriority.mutate({ ... })

// Write updated timestamp to cache so next mutation sends correct expectedVersion
const afterMutation = queryClient.getQueryData<BoardSnapshot>(queryKey)
if (afterMutation) {
  const newUpdatedAt = (result as { updatedAt?: Date })?.updatedAt ?? new Date()
  queryClient.setQueryData(queryKey, {
    ...afterMutation,
    buckets: afterMutation.buckets.map((b) => ({
      ...b,
      tasks: b.tasks.map((t) =>
        t.id === task.id ? { ...t, updatedAt: newUpdatedAt } : t
      ),
    })),
  })
}

await queryClient.invalidateQueries({ queryKey })
```

Check whether `setPriority`, `setDates`, `applyLabel`, `removeLabel` handlers return the task's new `updatedAt`. If not, update those handlers to return it (minimal backend change: return `{ updatedAt: task.updatedAt }` from the command handler).

### 3.2 Due Date `onChange` Fires Mid-Input

**Root cause:** `<input type="date">` in some browsers fires `onChange` when the user partially fills in the year field. The current handler immediately fires `setDates` on every change event.

**Fix:** Switch to `onBlur` for the date input. This fires only when the user commits the value (clicks away or tabs out). Keep `onChange` only for controlled value binding.

```tsx
<Input
  type="date"
  value={localDate}
  onChange={(e) => setLocalDate(e.target.value)} // local state only
  onBlur={(e) => void handleSetDueDate(e.target.value || null)} // fires mutation
/>
```

Add a `localDate` useState in `TaskCard` initialised from `task.dueDate`.

---

## 4. Drag-and-Drop Wiring

### 4.1 Column Reorder — Connect to API

**Current state:** `BoardColumn` uses `useSortable({ id: \`col-${bucket.id}\` })` and has full drag styles (opacity, transform). But:

1. No `SortableContext` wraps the column list in the board page.
2. `BoardDragContext.handleDragEnd` does not detect column drags; it falls through as a failed task drag.
3. `trpc.planner.buckets.reorder` exists but is never called from the board.

**Changes:**

**`BoardDragContext.tsx`:** Add `onReorderColumn` callback prop:

```ts
interface BoardDragContextProps {
  // ... existing
  onReorderColumn: (payload: ReorderColumnPayload) => void
  bucketOrderList: Array<{ id: string; orderHint: string }>
}

interface ReorderColumnPayload {
  bucketId: string
  hintAfter?: string
  hintBefore?: string
}
```

In `handleDragEnd`, detect column drag by `String(active.id).startsWith('col-')`:

```ts
const isColumnDrag = String(active.id).startsWith('col-')
if (isColumnDrag) {
  const bucketId = String(active.id).replace('col-', '')
  const overBucketId = String(over.id).replace('col-', '')
  const overIndex = bucketOrderList.findIndex((b) => b.id === overBucketId)
  const hintAfter = bucketOrderList[overIndex - 1]?.orderHint
  const hintBefore = bucketOrderList[overIndex]?.orderHint
  onReorderColumn({ bucketId, hintAfter, hintBefore })
  return
}
// existing task drag logic ...
```

**Board page (`app/plans/[id]/board/page.tsx`):**

1. Add `SortableContext` with `horizontalListSortingStrategy` wrapping the `BoardColumn` list.
2. Pass `bucketOrderList` and `onReorderColumn` to `BoardDragContext`.
3. Implement `handleReorderColumn` with optimistic patch + API call:

```ts
async function handleReorderColumn(payload: ReorderColumnPayload) {
  const snapshot = queryClient.getQueryData<BoardSnapshot>(queryKey)
  if (!snapshot) return

  // Optimistic: reorder buckets in cache
  const buckets = [...snapshot.buckets]
  const fromIdx = buckets.findIndex((b) => b.id === payload.bucketId)
  const [moved] = buckets.splice(fromIdx, 1)
  // Insert at position derived from hintBefore
  const toIdx = payload.hintBefore
    ? buckets.findIndex((b) => b.orderHint === payload.hintBefore)
    : buckets.length
  buckets.splice(toIdx, 0, moved)
  queryClient.setQueryData(queryKey, { ...snapshot, buckets })

  try {
    await trpc.planner.buckets.reorder.mutate({
      tenantId,
      planId,
      actorId,
      bucketId: payload.bucketId,
      orderHintAfter: payload.hintAfter,
      orderHintBefore: payload.hintBefore,
    })
    await queryClient.invalidateQueries({ queryKey })
  } catch (err) {
    queryClient.setQueryData(queryKey, snapshot)
    console.error('[BoardPage] reorderColumn failed', err)
  }
}
```

### 4.2 Task Order Within Same Bucket

**Current state:** Dragging a task within its bucket fires `onMove` → `useOptimisticMove.move()` → `trpc.planner.tasks.move.mutate()`. This is already correct. The `handleDragEnd` in `BoardDragContext` correctly derives `hintAfter`/`hintBefore` from the neighbour tasks.

**Verify:** Test that same-bucket reorder (e.g., drag task from position 2 to position 1) persists after page refresh. If the server `move` handler accepts same-bucket moves with updated order hints, no change needed. If not, confirm the `MoveTaskCommand` handler accepts `toBucketId === currentBucketId` moves.

#### Sort-active guard

When `state.sort` is non-null (the user has applied a sort), same-bucket drag-to-reorder is suppressed. The drag gesture still starts — so cross-bucket moves (dropping on a different column) continue to work — but if `handleDragEnd` detects a same-bucket drop with sort active, it returns early without calling `onMove`.

**`BoardDragContext.tsx`:** Add a `sortActive: boolean` prop:

```ts
interface BoardDragContextProps {
  // ... existing
  sortActive: boolean
}
```

In `handleDragEnd`, after resolving `toBucketId`, add:

```ts
const fromBucketId = taskIndex.get(taskId)?.bucketId
if (sortActive && fromBucketId === toBucketId) return // suppress same-bucket reorder when sort is active
```

**Board page (`app/plans/[id]/board/page.tsx`):** Pass `sortActive={!!state.sort}` to `BoardDragContext`.

**Visual indicator:** When `state.sort` is active, render a subtle chip in the board toolbar area:

```tsx
{
  state.sort && (
    <span className="text-tiny text-fg-muted">
      Sorted by {state.sort.field} — drag across columns to move tasks
    </span>
  )
}
```

This chip can live in the existing filter/sort bar (`ViewStateBar` or equivalent) without a new component. Exact placement follows current toolbar layout.

---

## 5. Files Changed

| File                                     | Change type                                                                                                                                          |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/board/QuickAddTask.tsx`      | Add `open`/`onOpenChange` props; restyle closed-state button                                                                                         |
| `components/board/TaskCard.tsx`          | Remove hover opacity from progress toggle; fix `expectedVersion` pattern for priority + due date mutations; add `localDate` state for due date input |
| `components/board/BoardColumn.tsx`       | Column header layout; always-visible grip; `+` shortcut; empty bucket state; lift `open` state for QuickAddTask                                      |
| `components/board/BoardDragContext.tsx`  | Add `onReorderColumn` + `bucketOrderList` props; detect column drags in `handleDragEnd`; add `sortActive` prop to guard same-bucket reorder          |
| `components/primitives/ProgressIcon.tsx` | Dashed not-started; amber in-progress; dark checkmark                                                                                                |
| `components/primitives/PriorityIcon.tsx` | Four distinct icon shapes per level                                                                                                                  |
| `components/labels/LabelPicker.tsx`      | Fix `expectedVersion` pattern after toggle                                                                                                           |
| `app/plans/[id]/board/page.tsx`          | `SortableContext` for columns; `handleReorderColumn`; pass `sortActive` + new props to `BoardDragContext`; sort-active chip in toolbar               |
| `apps/api` (optional)                    | If `setPriority`/`setDates`/`applyLabel`/`removeLabel` don't return `updatedAt`, add return value                                                    |

---

## 6. Testing

Per project TDD rules — tests written before implementation.

| Area                         | Test type             | What to cover                                                                                                            |
| ---------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `ProgressIcon`               | Unit                  | Renders dashed stroke at 0; amber fill at 50; green fill + checkmark at 100                                              |
| `PriorityIcon`               | Unit                  | Distinct SVG content per level; correct aria-label                                                                       |
| `TaskCard` progress toggle   | Unit                  | Click fires `onToggleComplete` with `0→100` and `100→0`; never 50                                                        |
| `TaskCard` priority mutation | Integration (real DB) | Two rapid priority changes both succeed; second doesn't fail with 409                                                    |
| `TaskCard` due date          | Unit                  | `onBlur` fires mutation; `onChange` does not                                                                             |
| `BoardColumn` empty state    | Unit                  | Renders placeholder when `bucket.tasks.length === 0`                                                                     |
| `BoardColumn` header `+`     | Unit                  | Clicking `+` expands `QuickAddTask`                                                                                      |
| Column drag                  | Integration           | Drag col A before col B → `buckets.reorder` called with correct hints; board cache updated optimistically                |
| Same-bucket task drag        | E2E Playwright        | Drag task 2 to position 1; refresh page; order persists                                                                  |
| Sort-active drag guard       | Unit                  | When `sortActive=true`, dropping task in same bucket calls `onMove` 0 times; cross-bucket drop still calls `onMove` once |

---

## 7. Out of Scope

- MS Planner sync for column order (that lives in the ms-sync module)
- Task detail panel progress cycling (0→50→100)
- Bucket color coding (MS Planner premium feature — deferred, no design spec yet)
- Any changes outside `web-planner` zone or the `planner` API module

---

## 8. Decision Log

| #   | Decision                                                                                          | Options Considered                                                                                                        | Rationale                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Single PR (Approach A)** — all UI, bug fixes, and drag wiring in one PR                         | A: single PR · B: split into UI-only PR and wiring PR                                                                     | All changes touch the same 8 files; splitting would create two incomplete half-states that can't be tested end-to-end independently                                                               |
| 2   | **Progress toggle fires 0 ↔ 100 only** — no 50 from the card click                                | A: cycle 0→50→100→0 on each click · B: toggle 0↔100 only                                                                  | In-progress (50) is a meaningful state set deliberately from the task detail panel; a single card click cycling through it would cause accidental state changes                                   |
| 3   | **`QuickAddTask` closed-state: raw `<button>` styled inline** — not a design-system variant       | A: add `variant="dashed"` to `@future/ui` Button · B: local raw `<button>`                                                | Single use case in one zone; adding a DS variant for it would be premature generalization (YAGNI)                                                                                                 |
| 4   | **Lift `open` state into `BoardColumn`** for the `+` header shortcut — prop approach              | A: prop `open`/`onOpenChange` · B: `useImperativeHandle` ref on `QuickAddTask`                                            | Props are simpler, easier to test, and avoid imperative ref patterns; the spec explicitly prefers the prop approach                                                                               |
| 5   | **`updatedAt` cache write after mutation** — use server-returned value, fall back to `new Date()` | A: wait for `invalidateQueries` refetch · B: write server `updatedAt` to cache immediately                                | Refetch is async; a second rapid mutation fires before refetch completes, sending a stale version to the server (409). Writing to cache immediately closes the race window                        |
| 6   | **API handlers return `{ updatedAt: Date }`** — minimal backend change                            | A: no backend change, always fall back to `new Date()` · B: return `updatedAt` from handler                               | `new Date()` is an approximation; the server clock is authoritative. Returning `updatedAt` from handlers is a one-line change per handler and eliminates any sub-second clock skew risk           |
| 7   | **Due date uses `onBlur` to fire mutation** — `onChange` only updates local state                 | A: fire mutation on every `onChange` · B: fire on `onBlur` only                                                           | `<input type="date">` fires `onChange` mid-input in Chrome/Safari when partially filling the year; firing the mutation there causes spurious 4-digit-year-is-0022 updates                         |
| 8   | **Column drag detection via `col-` id prefix** — string prefix on `useSortable` id                | A: separate `DndContext` for columns · B: single `DndContext`, detect by prefix                                           | A single `DndContext` avoids nesting two drag contexts (which @dnd-kit does not support); the `col-` prefix is already present in the existing `useSortable({ id: \`col-${bucket.id}\` })` call   |
| 9   | **Empty bucket copy: "Nothing to review" / "Drop a task here…"**                                  | Several alternatives drafted                                                                                              | User-specified exact copy during design review                                                                                                                                                    |
| 10  | **PriorityIcon: semantically distinct shapes per level** — not color-only differentiation         | A: same bar shape, color-coded · B: distinct icons (dash, bars, urgent square)                                            | Color-only distinction fails accessibility; distinct shapes make levels readable at a glance without relying on color perception                                                                  |
| 11  | **Sort active → block same-bucket drag-to-reorder; cross-bucket move still works**                | A: block same-bucket drag (early return in `handleDragEnd`) · B: allow drag, suppress API call silently · C: out of scope | MS Planner ref: sort and manual order are mutually exclusive. Option A gives honest feedback; snap-back (B) looks like a bug. Cross-bucket moves are always intentional so they remain unblocked. |
| 12  | **Inline editing stays on the card** — priority, due date, labels, assignees editable from card   | A: keep inline editing on card · B: card is read-only summary; all edits in detail panel (MS Planner model)               | Our design prioritises power-user speed; the detail panel is out of scope for this PR. Diverging from MS Planner's progressive disclosure is a deliberate product choice.                         |

---

## 9. References

| Source                                              | URL                                                                                                                    | Used for                                                            |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| MS Planner — Create buckets                         | https://support.microsoft.com/en-au/office/create-buckets-to-sort-your-tasks-238af119-3c2b-4cbb-a124-29da99488139      | Bucket UX: rename inline, reorder via drag, color coding (deferred) |
| MS Planner — Manage tasks                           | https://support.microsoft.com/en-us/office/manage-your-tasks-in-microsoft-planner-7e3d66b4-684d-4a2f-8fbe-908c614d8314 | Task card UX: drag between/within buckets, quick actions, filtering |
| MS Planner — Creating buckets and tasks (RPI guide) | https://itssc.rpi.edu/hc/en-us/articles/19379074676109-Microsoft-Planner-Creating-Buckets-and-Tasks                    | Drag interaction as primary board manipulation model                |
| MS Learn — Reorder bucket Q&A                       | https://learn.microsoft.com/en-us/answers/questions/c74d742c-4227-4171-b2b9-12c7d71d33bd/reorder-bucket-in-ms-planner  | Bucket reorder: fully draggable; task manual order constraints      |
| MS Learn — Task ordering issue                      | https://learn.microsoft.com/en-us/answers/questions/5851900/tasks-in-microsoft-planner-grid-can-no-longer-be-r         | Sort vs manual mode exclusivity → Decision 11                       |
