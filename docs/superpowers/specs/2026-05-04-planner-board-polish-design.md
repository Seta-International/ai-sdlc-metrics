# Planner Board Polish — Design Spec

**Date:** 2026-05-04  
**Scope:** `apps/web-planner` — board view UI, drag-and-drop wiring, mutation bug fixes  
**Delivery:** Single PR, Approach A (all changes together)

---

## 1. Overview

Six visual gaps vs the design spec, two confirmed bugs, and two drag-and-drop features that are structurally wired but not connected to the API. All changes are co-located in `apps/web-planner/src/components/board/` and the board page.

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
│   No tasks yet                  │
└─────────────────────────────────┘
```

Specifics:

- Container: `border: 1px dashed rgba(255,255,255,0.06)`, `border-radius: 8px`, `min-height: 80px`, flex column centered
- Small kanban SVG icon in a `28×28` rounded container, color `#3e3e44`
- Text: "No tasks yet", `font-size: 11px`, `color: #3e3e44`
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

No code change expected here — just a verification step during implementation.

---

## 5. Files Changed

| File                                     | Change type                                                                                                                                          |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/board/QuickAddTask.tsx`      | Add `open`/`onOpenChange` props; restyle closed-state button                                                                                         |
| `components/board/TaskCard.tsx`          | Remove hover opacity from progress toggle; fix `expectedVersion` pattern for priority + due date mutations; add `localDate` state for due date input |
| `components/board/BoardColumn.tsx`       | Column header layout; always-visible grip; `+` shortcut; empty bucket state; lift `open` state for QuickAddTask                                      |
| `components/board/BoardDragContext.tsx`  | Add `onReorderColumn` + `bucketOrderList` props; detect column drags in `handleDragEnd`                                                              |
| `components/primitives/ProgressIcon.tsx` | Dashed not-started; amber in-progress; dark checkmark                                                                                                |
| `components/primitives/PriorityIcon.tsx` | Four distinct icon shapes per level                                                                                                                  |
| `components/labels/LabelPicker.tsx`      | Fix `expectedVersion` pattern after toggle                                                                                                           |
| `app/plans/[id]/board/page.tsx`          | `SortableContext` for columns; `handleReorderColumn`; pass new props to `BoardDragContext`                                                           |
| `apps/api` (optional)                    | If `setPriority`/`setDates`/`applyLabel`/`removeLabel` don't return `updatedAt`, add return value                                                    |

---

## 6. Testing

Per project TDD rules — tests written before implementation.

| Area                         | Test type             | What to cover                                                                                             |
| ---------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------- |
| `ProgressIcon`               | Unit                  | Renders dashed stroke at 0; amber fill at 50; green fill + checkmark at 100                               |
| `PriorityIcon`               | Unit                  | Distinct SVG content per level; correct aria-label                                                        |
| `TaskCard` progress toggle   | Unit                  | Click fires `onToggleComplete` with `0→100` and `100→0`; never 50                                         |
| `TaskCard` priority mutation | Integration (real DB) | Two rapid priority changes both succeed; second doesn't fail with 409                                     |
| `TaskCard` due date          | Unit                  | `onBlur` fires mutation; `onChange` does not                                                              |
| `BoardColumn` empty state    | Unit                  | Renders placeholder when `bucket.tasks.length === 0`                                                      |
| `BoardColumn` header `+`     | Unit                  | Clicking `+` expands `QuickAddTask`                                                                       |
| Column drag                  | Integration           | Drag col A before col B → `buckets.reorder` called with correct hints; board cache updated optimistically |
| Same-bucket task drag        | E2E Playwright        | Drag task 2 to position 1; refresh page; order persists                                                   |

---

## 7. Out of Scope

- MS Planner sync for column order (that lives in the ms-sync module)
- Task detail panel progress cycling (0→50→100)
- Any changes outside `web-planner` zone or the `planner` API module
