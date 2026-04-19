# Plan 03 — Schedule View + Unscheduled Panel + Drag-to-Date

> Covers spec **Plan 2.3** — see [design spec §6.6, §9](../../specs/2026-04-19-planner-views-design.md).
> Depends on Plans 01 and 02 being merged (uses `tasks.getFlat`, `useViewState`, `setDates`).

**Goal:** Ship the Schedule view — a calendar-backed timeline with Week and Month modes. Tasks render per MS Planner semantics (bar for start+due, pin for due-only, invisible for start-only and dateless). An Unscheduled side panel lists dateless and start-only tasks and lets users drag them onto the calendar to set dates. Drag-to-date interactions on calendar bars shift / resize tasks with optimistic updates.

**Architecture:** Reuses `@dnd-kit/core` already in the zone from Plan #1. The calendar grid is a CSS-grid layout (not absolute positioning) so tasks naturally reflow when the filter bar updates. Date math is centralized in `lib/schedule-dates.ts` and unit-tested exhaustively (DST boundaries, month-end wraps). All mutations route to the existing `setDates` handler from #1; no new backend endpoints.

**Tech stack:** `@dnd-kit/core` + `@dnd-kit/modifiers`, `date-fns` (already in the zone), existing Radix primitives from `@future/ui`.

---

## File Map

| File                                                                 | Action  | Purpose                                                                  |
| -------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------ |
| `apps/web-planner/src/lib/schedule-dates.ts`                         | Create  | Pure helpers: week grid, month grid, bar span calc, drag-delta math      |
| `apps/web-planner/src/lib/schedule-dates.spec.ts`                    | Create  | Exhaustive date math tests (DST, month-end, year-end)                    |
| `apps/web-planner/src/lib/schedule-render.ts`                        | Create  | Pure helper: `TaskFlat[] → { bars, pins, unscheduled }`                  |
| `apps/web-planner/src/lib/schedule-render.spec.ts`                   | Create  | Covers the four rendering cases (both / due-only / start-only / neither) |
| `apps/web-planner/src/components/schedule/ScheduleCalendar.tsx`      | Create  | Top-level shell — mode toggle, grid, drag context                        |
| `apps/web-planner/src/components/schedule/ScheduleToolbar.tsx`       | Create  | Week/Month toggle + nav + "Today" button                                 |
| `apps/web-planner/src/components/schedule/WeekGrid.tsx`              | Create  | 7-column day grid for Week mode                                          |
| `apps/web-planner/src/components/schedule/MonthGrid.tsx`             | Create  | 6×7 cell grid for Month mode                                             |
| `apps/web-planner/src/components/schedule/TaskBar.tsx`               | Create  | Multi-day bar with drag handles                                          |
| `apps/web-planner/src/components/schedule/TaskPin.tsx`               | Create  | Due-only pill                                                            |
| `apps/web-planner/src/components/schedule/UnscheduledPanel.tsx`      | Create  | Right sidebar — searchable, draggable items                              |
| `apps/web-planner/src/components/schedule/DragOverlay.tsx`           | Create  | Floating preview during drag                                             |
| `apps/web-planner/src/components/schedule/useScheduleDrag.ts`        | Create  | `@dnd-kit` state machine for shift / resize / schedule-from-panel        |
| `apps/web-planner/src/components/schedule/FilterFirstEmptyState.tsx` | Create  | Soft empty state for unfiltered > 150-task plans                         |
| `apps/web-planner/src/components/schedule/ScheduleCalendar.spec.tsx` | Create  | Integration test                                                         |
| `apps/web-planner/src/components/schedule/useScheduleDrag.spec.ts`   | Create  | Drag math unit test                                                      |
| `apps/web-planner/src/app/plans/[id]/schedule/page.tsx`              | Replace | Drop ComingSoon; render `<ScheduleCalendar />`                           |
| `apps/web-planner/e2e/schedule.e2e.ts`                               | Create  | Playwright: drag bar to new date; drag unscheduled onto day              |
| `apps/web-planner/src/components/view-picker/ViewPicker.tsx`         | Modify  | Enable Schedule tab when flag on                                         |

---

## Task 1 — `schedule-dates` pure date math (TDD)

**Files:**

- Create: `apps/web-planner/src/lib/schedule-dates.ts`
- Create: `apps/web-planner/src/lib/schedule-dates.spec.ts`

- [ ] **Step 1: Write exhaustive tests.** Cover: week range for any date, month range, day-index within range, DST forward/back days, month-end wraps, bar span calculation.

```ts
// schedule-dates.spec.ts
import { describe, expect, it } from 'vitest'
import {
  weekRange,
  monthRange,
  dayIndexInRange,
  barSpanDays,
  addDaysUTC,
  isSameDayUTC,
} from './schedule-dates'

describe('schedule-dates', () => {
  it('weekRange starts on ISO Monday and ends Sunday', () => {
    const wk = weekRange(new Date('2026-04-19T00:00Z')) // Sunday
    expect(wk.start.toISOString()).toBe('2026-04-13T00:00:00.000Z')
    expect(wk.end.toISOString()).toBe('2026-04-19T00:00:00.000Z')
  })

  it('monthRange covers 6 weeks (42 days) starting from the Monday before month-start', () => {
    const m = monthRange(new Date('2026-04-01T00:00Z'))
    expect(m.cells).toHaveLength(42)
    expect(m.cells[0].toISOString()).toBe('2026-03-30T00:00:00.000Z')
  })

  it('barSpanDays returns inclusive day count', () => {
    expect(barSpanDays('2026-04-10T00:00Z', '2026-04-12T00:00Z')).toBe(3)
    expect(barSpanDays('2026-04-10T00:00Z', '2026-04-10T00:00Z')).toBe(1)
  })

  it('is DST-safe — a bar spanning a spring-forward day still reports 2 calendar days', () => {
    // US DST: 2026-03-08 @ 02:00 → 03:00
    expect(barSpanDays('2026-03-07T00:00Z', '2026-03-08T00:00Z')).toBe(2)
  })

  it('addDaysUTC never drifts via wall-clock timezone', () => {
    expect(addDaysUTC(new Date('2026-03-31T00:00Z'), 1).toISOString()).toBe(
      '2026-04-01T00:00:00.000Z',
    )
  })
})
```

- [ ] **Step 2: Run — fail.**

- [ ] **Step 3: Implement with UTC-only arithmetic.**

```ts
// schedule-dates.ts
export function addDaysUTC(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000)
}
export function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}
export function isSameDayUTC(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  )
}
export function weekRange(d: Date): { start: Date; end: Date; days: Date[] } {
  const start = startOfDayUTC(d)
  const isoDow = (start.getUTCDay() + 6) % 7 // Mon=0 … Sun=6
  const monday = addDaysUTC(start, -isoDow)
  return {
    start: monday,
    end: addDaysUTC(monday, 6),
    days: Array.from({ length: 7 }, (_, i) => addDaysUTC(monday, i)),
  }
}
export function monthRange(d: Date): { start: Date; cells: Date[] } {
  const firstOfMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
  const isoDow = (firstOfMonth.getUTCDay() + 6) % 7
  const gridStart = addDaysUTC(firstOfMonth, -isoDow)
  return {
    start: gridStart,
    cells: Array.from({ length: 42 }, (_, i) => addDaysUTC(gridStart, i)),
  }
}
export function dayIndexInRange(rangeStart: Date, day: Date): number {
  return Math.round((startOfDayUTC(day).getTime() - rangeStart.getTime()) / 86_400_000)
}
export function barSpanDays(startIso: string, dueIso: string): number {
  const s = startOfDayUTC(new Date(startIso))
  const e = startOfDayUTC(new Date(dueIso))
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1)
}
```

- [ ] **Step 4: Run — pass.**
- [ ] **Step 5: Commit.**

```bash
git add apps/web-planner/src/lib/schedule-dates.ts apps/web-planner/src/lib/schedule-dates.spec.ts
git commit -m "feat(web-planner): pure schedule date math with UTC-only arithmetic"
```

---

## Task 2 — `schedule-render` categorizer (TDD)

**Files:**

- Create: `apps/web-planner/src/lib/schedule-render.ts`
- Create: `apps/web-planner/src/lib/schedule-render.spec.ts`

- [ ] **Step 1: Test** the four rendering cases from Decision 2-4.

```ts
// schedule-render.spec.ts
describe('classifyForSchedule', () => {
  it.each([
    [{ startDate: '2026-04-10T00:00Z', dueDate: '2026-04-12T00:00Z' }, 'bar'],
    [{ startDate: null, dueDate: '2026-04-12T00:00Z' }, 'pin'],
    [{ startDate: '2026-04-10T00:00Z', dueDate: null }, 'unscheduled'],
    [{ startDate: null, dueDate: null }, 'unscheduled'],
  ])('classifies %o as %s', (partial, expected) => {
    expect(classifyForSchedule(mkTask(partial))).toBe(expected)
  })
})
```

- [ ] **Step 2: Run — fail.**
- [ ] **Step 3: Implement.**

```ts
// schedule-render.ts
import type { TaskFlat } from '@future/api-client/planner'

export type ScheduleClass = 'bar' | 'pin' | 'unscheduled'

export function classifyForSchedule(t: TaskFlat): ScheduleClass {
  if (t.startDate && t.dueDate) return 'bar'
  if (!t.startDate && t.dueDate) return 'pin'
  return 'unscheduled' // start-only OR neither
}

export function partitionForSchedule(tasks: TaskFlat[]): {
  bars: TaskFlat[]
  pins: TaskFlat[]
  unscheduled: TaskFlat[]
} {
  const bars: TaskFlat[] = [],
    pins: TaskFlat[] = [],
    unscheduled: TaskFlat[] = []
  for (const t of tasks) {
    const cls = classifyForSchedule(t)
    if (cls === 'bar') bars.push(t)
    else if (cls === 'pin') pins.push(t)
    else unscheduled.push(t)
  }
  return { bars, pins, unscheduled }
}
```

- [ ] **Step 4: Run — pass.**
- [ ] **Step 5: Commit.**

---

## Task 3 — `ScheduleToolbar` (Week/Month toggle + nav)

**Files:**

- Create: `apps/web-planner/src/components/schedule/ScheduleToolbar.tsx`

- [ ] **Step 1: Test** — Week/Month toggle writes `?scale=` to URL via `useViewState`. Prev/Next buttons shift the anchor date by ±1 week (Week mode) or ±1 month (Month mode). "Today" resets to `new Date()`.

- [ ] **Step 2:** Implement toolbar using `@future/ui` ToggleGroup + Button.

- [ ] **Step 3:** The anchor date is local to the Schedule page (ephemeral state) — NOT in the URL. Only the mode (`scale=week|month`) is in the URL per spec.

- [ ] **Step 4: Run tests — pass.**
- [ ] **Step 5: Commit.**

---

## Task 4 — `WeekGrid` static render (TDD)

**Files:**

- Create: `apps/web-planner/src/components/schedule/WeekGrid.tsx`
- Append tests to `ScheduleCalendar.spec.tsx`

- [ ] **Step 1: Test** — renders 7 day columns for the anchor week; bars span correct columns; pins placed on the right day.

```tsx
// inside ScheduleCalendar.spec.tsx
it('WeekGrid places a 3-day bar across columns 0..2', () => {
  render(
    <WeekGrid
      anchor={new Date('2026-04-13T00:00Z')}
      tasks={[mkTask({ id: '1', startDate: '2026-04-13T00:00Z', dueDate: '2026-04-15T00:00Z' })]}
    />,
  )
  const bar = screen.getByTestId('task-bar-1')
  expect(bar).toHaveStyle({ gridColumn: '1 / span 3' })
})
```

- [ ] **Step 2: Run — fail.**

- [ ] **Step 3: Implement.**

```tsx
// WeekGrid.tsx
'use client'
import { weekRange, dayIndexInRange, barSpanDays } from '@/lib/schedule-dates'
import { classifyForSchedule } from '@/lib/schedule-render'
import { TaskBar } from './TaskBar'
import { TaskPin } from './TaskPin'
import type { TaskFlat } from '@future/api-client/planner'

export function WeekGrid({ anchor, tasks }: { anchor: Date; tasks: TaskFlat[] }) {
  const { start, days } = weekRange(anchor)

  return (
    <div className="grid h-full grid-cols-7 border-t border-border">
      {days.map((d, i) => (
        <div key={d.toISOString()} className="border-l border-border px-2 py-1 first:border-l-0">
          <div className="text-xs font-medium text-muted-foreground">
            {d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}
          </div>
        </div>
      ))}
      <div className="col-span-7 grid grid-cols-7 gap-y-1 px-2 pt-8">
        {tasks.map((t) => {
          const cls = classifyForSchedule(t)
          if (cls === 'unscheduled') return null
          if (cls === 'pin') {
            const col = dayIndexInRange(start, new Date(t.dueDate!)) + 1
            return col >= 1 && col <= 7 ? (
              <TaskPin key={t.id} task={t} style={{ gridColumn: `${col} / span 1` }} />
            ) : null
          }
          // bar
          const colStart = Math.max(1, dayIndexInRange(start, new Date(t.startDate!)) + 1)
          const span = Math.min(7 - colStart + 1, barSpanDays(t.startDate!, t.dueDate!))
          return span > 0 ? (
            <TaskBar key={t.id} task={t} style={{ gridColumn: `${colStart} / span ${span}` }} />
          ) : null
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run — pass.**
- [ ] **Step 5: Commit.**

---

## Task 5 — `MonthGrid` static render

**Files:**

- Create: `apps/web-planner/src/components/schedule/MonthGrid.tsx`

- [ ] **Step 1: Test** — 42 cells, 6 weeks. Bars span within a single week row (wrap across weeks becomes two segments).
- [ ] **Step 2:** Implement. Multi-week bars render as one segment per week using CSS grid rows.
- [ ] **Step 3:** Run — pass.
- [ ] **Step 4:** Commit.

---

## Task 6 — `TaskBar` and `TaskPin` components

**Files:**

- Create: `apps/web-planner/src/components/schedule/TaskBar.tsx`
- Create: `apps/web-planner/src/components/schedule/TaskPin.tsx`

- [ ] **Step 1: Test** — hover reveals resize handles on bars; clicking a bar opens the detail panel; keyboard drag (space-arrow-space) fires the drag handlers.

- [ ] **Step 2:** Implement. Both components are `useDraggable` targets from `@dnd-kit`. Bars expose three drag handles (left edge, center, right edge) with distinct `data` payloads so the drag-end logic can tell them apart.

```tsx
// TaskBar.tsx
'use client'
import { useDraggable } from '@dnd-kit/core'

export function TaskBar({ task, style }: { task: TaskFlat; style?: React.CSSProperties }) {
  const center = useDraggable({
    id: `bar-shift:${task.id}`,
    data: { kind: 'shift', taskId: task.id },
  })
  const left = useDraggable({
    id: `bar-left:${task.id}`,
    data: { kind: 'resize-start', taskId: task.id },
  })
  const right = useDraggable({
    id: `bar-right:${task.id}`,
    data: { kind: 'resize-due', taskId: task.id },
  })

  return (
    <div
      ref={center.setNodeRef}
      {...center.attributes}
      {...center.listeners}
      style={{
        ...style,
        transform: center.transform ? `translateX(${center.transform.x}px)` : undefined,
      }}
      className="group relative flex h-7 items-center rounded bg-primary/15 px-2 text-xs hover:bg-primary/25 focus:ring-2"
    >
      <button
        ref={left.setNodeRef}
        {...left.listeners}
        className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize opacity-0 group-hover:opacity-100"
      />
      <span className="truncate">{task.title}</span>
      <button
        ref={right.setNodeRef}
        {...right.listeners}
        className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize opacity-0 group-hover:opacity-100"
      />
    </div>
  )
}
```

- [ ] **Step 3:** Run — pass.
- [ ] **Step 4:** Commit.

---

## Task 7 — `useScheduleDrag` drag math (TDD)

**Files:**

- Create: `apps/web-planner/src/components/schedule/useScheduleDrag.ts`
- Create: `apps/web-planner/src/components/schedule/useScheduleDrag.spec.ts`

- [ ] **Step 1: Test** — given drag info (day-delta, kind, task), the hook computes the new `{ startDate, dueDate }` correctly.

```ts
describe('resolveDragEnd', () => {
  it('shift: both dates move by delta, duration preserved', () => {
    const out = resolveDragEnd({
      kind: 'shift',
      task: mkTask({ startDate: '2026-04-10T00:00Z', dueDate: '2026-04-12T00:00Z' }),
      dayDelta: 3,
    })
    expect(out).toEqual({ startDate: '2026-04-13T00:00Z', dueDate: '2026-04-15T00:00Z' })
  })

  it('resize-due: only dueDate moves; clamps to ≥ startDate', () => {
    /* … */
  })

  it('resize-start: only startDate moves; clamps to ≤ dueDate', () => {
    /* … */
  })

  it('pin drag: due moves; startDate remains null', () => {
    const out = resolveDragEnd({
      kind: 'pin-shift',
      task: mkTask({ startDate: null, dueDate: '2026-04-10T00:00Z' }),
      dayDelta: 2,
    })
    expect(out).toEqual({ startDate: null, dueDate: '2026-04-12T00:00Z' })
  })

  it('unscheduled-drop: sets dueDate to target day; startDate = dueDate', () => {
    const out = resolveDragEnd({
      kind: 'unscheduled-drop',
      task: mkTask({ startDate: null, dueDate: null }),
      targetDay: new Date('2026-04-15T00:00Z'),
    })
    expect(out).toEqual({ startDate: '2026-04-15T00:00Z', dueDate: '2026-04-15T00:00Z' })
  })
})
```

- [ ] **Step 2: Run — fail.**

- [ ] **Step 3: Implement.** `resolveDragEnd` is a pure function; the hook wraps it with `@dnd-kit`'s `onDragEnd` and calls `trpc.planner.tasks.setDates.useMutation`.

- [ ] **Step 4: Run — pass.**
- [ ] **Step 5: Commit.**

```bash
git add apps/web-planner/src/components/schedule/useScheduleDrag.{ts,spec.ts}
git commit -m "feat(web-planner): schedule drag math — shift / resize / pin / unscheduled-drop"
```

---

## Task 8 — `UnscheduledPanel`

**Files:**

- Create: `apps/web-planner/src/components/schedule/UnscheduledPanel.tsx`

- [ ] **Step 1: Test**:
  - Lists dateless + start-only tasks.
  - Search filters the list.
  - Each item is `useDraggable`.
  - Dropping a calendar bar onto the panel shows a confirm dialog, then clears both dates.

- [ ] **Step 2:** Implement. Collapsible sidebar via `@future/ui` Sheet primitive; search via `Command`.

```tsx
// UnscheduledPanel.tsx
export function UnscheduledPanel({
  tasks,
  onClearDates,
}: {
  tasks: TaskFlat[]
  onClearDates: (taskId: string) => void
}) {
  const [search, setSearch] = useState('')
  const filtered = useMemo(
    () => tasks.filter((t) => t.title.toLowerCase().includes(search.toLowerCase())),
    [tasks, search],
  )
  const { setNodeRef, isOver } = useDroppable({ id: 'unscheduled-panel' })

  return (
    <aside
      ref={setNodeRef}
      className={cn('flex w-72 flex-col border-l border-border', isOver && 'bg-muted/50')}
    >
      <div className="px-4 py-3 text-sm font-medium">Unscheduled ({filtered.length})</div>
      <Input
        placeholder="Search…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mx-4"
      />
      <ul className="flex-1 overflow-auto px-4 py-2">
        {filtered.map((t) => (
          <UnscheduledItem key={t.id} task={t} />
        ))}
      </ul>
    </aside>
  )
}
```

- [ ] **Step 3:** Run — pass.
- [ ] **Step 4:** Commit.

---

## Task 9 — `FilterFirstEmptyState`

**Files:**

- Create: `apps/web-planner/src/components/schedule/FilterFirstEmptyState.tsx`

- [ ] **Step 1:** A `<Card>` with the message "Schedule view works best with a filter." and two buttons: "Add filter" (focuses the filter bar) and "Show all anyway" (sets a local override flag).
- [ ] **Step 2:** Unit test: component renders when `unfilteredCount > 150 && no filter applied`; the "Show all" button calls the override callback.
- [ ] **Step 3:** Commit.

---

## Task 10 — `ScheduleCalendar` top-level assembly

**Files:**

- Create: `apps/web-planner/src/components/schedule/ScheduleCalendar.tsx`
- Create: `apps/web-planner/src/components/schedule/ScheduleCalendar.spec.tsx`

- [ ] **Step 1:** Wires up DndContext, toolbar, grid (Week or Month), Unscheduled panel, and drag overlay. Listens for drag-end and invokes `useScheduleDrag`.

```tsx
// ScheduleCalendar.tsx
'use client'
import { DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core'
import { useState, useMemo } from 'react'
import { useViewState } from '@/lib/view-state'
import { partitionForSchedule } from '@/lib/schedule-render'
import { ScheduleToolbar } from './ScheduleToolbar'
import { WeekGrid } from './WeekGrid'
import { MonthGrid } from './MonthGrid'
import { UnscheduledPanel } from './UnscheduledPanel'
import { DragOverlay as ScheduleDragOverlay } from './DragOverlay'
import { FilterFirstEmptyState } from './FilterFirstEmptyState'
import { useScheduleDrag } from './useScheduleDrag'

export function ScheduleCalendar({ planId, tasks }: { planId: string; tasks: TaskFlat[] }) {
  const { state } = useViewState({ planId })
  const [anchor, setAnchor] = useState<Date>(() => new Date())
  const [showAll, setShowAll] = useState(false)
  const { bars, pins, unscheduled } = useMemo(() => partitionForSchedule(tasks), [tasks])

  const tooMany = !showAll && tasks.length > 150 && !hasAnyFilter(state.filter)
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor))
  const { onDragStart, onDragEnd, active } = useScheduleDrag({
    anchor,
    scale: state.scale ?? 'week',
  })

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex h-[calc(100vh-11rem)]">
        <div className="flex min-w-0 flex-1 flex-col">
          <ScheduleToolbar planId={planId} anchor={anchor} onAnchorChange={setAnchor} />
          {tooMany ? (
            <FilterFirstEmptyState taskCount={tasks.length} onShowAll={() => setShowAll(true)} />
          ) : state.scale === 'month' ? (
            <MonthGrid anchor={anchor} bars={bars} pins={pins} />
          ) : (
            <WeekGrid anchor={anchor} bars={bars} pins={pins} />
          )}
        </div>
        <UnscheduledPanel tasks={unscheduled} onClearDates={/* wired to setDates with nulls */} />
        <ScheduleDragOverlay active={active} />
      </div>
    </DndContext>
  )
}
```

- [ ] **Step 2:** Integration test renders a 50-task fixture and verifies:
  - Bars, pins, unscheduled items distribute correctly.
  - Changing mode to Month re-renders.
  - Dragging a bar fires `setDates`.

- [ ] **Step 3:** Run — pass.
- [ ] **Step 4:** Commit.

---

## Task 11 — Schedule page

**Files:**

- Replace: `apps/web-planner/src/app/plans/[id]/schedule/page.tsx`

- [ ] **Step 1:** Replace ComingSoon with:

```tsx
export default function SchedulePage({ params }: { params: { id: string } }) {
  const { processed, isLoading, error } = useFlatTasks({ planId: params.id })
  if (isLoading) return <Skeleton className="h-[60vh]" />
  if (error)
    return (
      <Alert variant="destructive">
        <AlertDescription>Failed to load tasks.</AlertDescription>
      </Alert>
    )
  return <ScheduleCalendar planId={params.id} tasks={processed?.rows ?? []} />
}
```

- [ ] **Step 2:** Enable Schedule tab in ViewPicker when `planner.schedule.enabled` is on.
- [ ] **Step 3:** Commit.

---

## Task 12 — Group-by color coding + legend

**Files:**

- Modify: `TaskBar.tsx`, `TaskPin.tsx`
- Modify: `ScheduleToolbar.tsx` — add legend

- [ ] **Step 1: Test** — with group-by=priority, bars color-coded by priority via `packages/ui/tokens/chart.ts` (tokens first introduced in this plan as a stub; fleshed out in Plan 04).
- [ ] **Step 2:** Implement `barBackgroundClass(task, groupBy)` helper.
- [ ] **Step 3:** Commit.

---

## Task 13 — Playwright E2E

**Files:**

- Create: `apps/web-planner/e2e/schedule.e2e.ts`

- [ ] **Step 1:** Seed plan with: 3 bars, 2 pins, 2 unscheduled.
- [ ] **Step 2:** Steps:
  1. Open Schedule (week mode).
  2. Assert all 3 bars + 2 pins render.
  3. Drag bar center right by ~50 px. Assert `setDates` called; reload, bar is on the new day.
  4. Drag an unscheduled item onto Friday. Assert `setDates({ startDate, dueDate })` with that Friday.
  5. Switch to Month mode. Assert layout re-renders without error.
  6. Filter to Priority=Urgent. Assert only urgent tasks visible.

- [ ] **Step 3:** Commit.

---

## Task 14 — Flip `planner.schedule.enabled` for SETA tenant

- [ ] **Step 1:** Flip flag.
- [ ] **Step 2:** Smoke test.
- [ ] **Step 3:** PR.

---

## Acceptance

- Week + Month modes both render correctly with the seeded fixture plan.
- Dragging bars / pins / unscheduled items fires `setDates` with correct payload and rollback on error.
- Filter-first soft empty state appears for unfiltered plans with > 150 tasks.
- Group-by color-coding shows bars tinted by active group.
- Accessibility: keyboard drag works for bars (`Space → Arrow → Space` per `@dnd-kit` convention).
- Coverage ≥70%.

## Risks for this plan

| Risk                                                                                         | Mitigation                                                                                                                                                 |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drag math off-by-one at month boundaries                                                     | Exhaustive table-driven tests on `schedule-dates` + `useScheduleDrag`.                                                                                     |
| Timezone drift — browser TZ display diverging from UTC storage                               | All math in UTC; display uses `toLocaleDateString` with explicit `timeZone` only if the user has a preferred TZ set. Default to browser local for display. |
| Large plans (500+ dated tasks) slow to render                                                | `FilterFirstEmptyState` above 150 tasks; bars use `CSS Grid` (flow layout) so layout cost scales linearly; no O(n²).                                       |
| `@dnd-kit` focus-trap edge cases on keyboard drag                                            | Use the library's built-in `KeyboardSensor`; cover with a11y test.                                                                                         |
| Unscheduled panel DnD losing the drag-end target when user drags back to calendar from panel | Explicit `useDroppable` on each day cell + one on the panel; drag-end resolves by `over.id`.                                                               |
| User drags a pin across week boundaries in Month mode                                        | Day-delta math uses `dayIndexInRange` on the month grid; test covers cross-week drags.                                                                     |
| Drag mutations racing with a polling refresh                                                 | Optimistic update with `onMutate` / `onError`; React Query stale-time = 5 s; server-side conflict returns 409 → toast + refetch.                           |
