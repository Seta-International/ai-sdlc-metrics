# Plan 03 — `@future/schedule` Package + Planner Adoption

> Covers spec **Plan 2.3** — see [design spec §6.6, §9](../../specs/2026-04-19-planner-views-design.md).
> Depends on Plans 01 and 02 being merged (uses `useViewState`, `tasks.getFlat`, `tasks.setDates`).

**Goal:** Extract the Schedule view into a reusable monorepo package `@future/schedule` — a domain-agnostic day-granular calendar with Week / Month / Day / custom-duration views, drag-shift / drag-resize, external drop (Unscheduled panel), and theme integration with `@future/ui`. Sub-project #2's Schedule view becomes the first consumer; future modules (`hiring` interviews, `time` leave/OT, `projects` milestones, `performance` cycles) can adopt it without re-implementing calendar semantics.

**Architecture:**

- **Package** is built on `@fullcalendar/react` with only the MIT plugins (`core`, `react`, `daygrid`, `interaction`). No premium/Scheduler plugins, no `schedulerLicenseKey`.
- **Package exposes** a generic `ScheduleItem` model (`{ id, title, startDate, dueDate, ... }`) plus wrapper components. It knows nothing about tasks, planner, or tRPC.
- **Host app** (web-planner for Plan 03) provides a **thin adapter hook** that maps `TaskFlat → ScheduleItem`, wires the `onDateChange` callback to the existing `tasks.setDates` tRPC mutation, and handles confirmation dialogs.
- **MS-Planner-specific semantics** (pin vs bar, start-only → unscheduled, pin stays a pin on drag) are encoded in the package's pure helpers and covered by domain-agnostic tests. Planner inherits them by default; other consumers opt in via a `preservePinSemantics` flag on the component (default: `true`).

**Tech stack:** `@fullcalendar/react`, `@fullcalendar/core`, `@fullcalendar/daygrid`, `@fullcalendar/interaction` (all MIT / standard), `@future/ui`, `@future/tsconfig`, `@future/eslint-config`, Vitest, `@testing-library/react`, `happy-dom`.

**Why this shape:** Hand-rolling a calendar — or duplicating FullCalendar wiring across four modules — loses weeks of work to edge-case re-discovery (DST, multi-week bar wrapping, keyboard a11y, external drop integration). Consolidating in one package costs ~1 extra day over the integrated version, pays back on the first reuse, and keeps the FullCalendar upgrade path in one file.

---

## File Map

### New package `packages/schedule/`

| File                                              | Action | Purpose                                                               |
| ------------------------------------------------- | ------ | --------------------------------------------------------------------- |
| `packages/schedule/package.json`                  | Create | Package manifest (follows `@future/charts` shape)                     |
| `packages/schedule/tsconfig.json`                 | Create | Extends `@future/tsconfig/react-library.json`                         |
| `packages/schedule/vitest.config.ts`              | Create | happy-dom env, matching `@future/ui` config                           |
| `packages/schedule/src/index.ts`                  | Create | Public API barrel                                                     |
| `packages/schedule/src/types.ts`                  | Create | `ScheduleItem`, `ScheduleView`, `ScheduleChange`, `DragKind` etc.     |
| `packages/schedule/src/schedule-render.ts`        | Create | Pure classifier: `ScheduleItem → 'bar' \| 'pin' \| 'unscheduled'`     |
| `packages/schedule/src/schedule-render.spec.ts`   | Create | Covers four rendering cases + MS-pin preservation flag                |
| `packages/schedule/src/item-to-fc-event.ts`       | Create | Generic mapper: `ScheduleItem → EventInput`                           |
| `packages/schedule/src/item-to-fc-event.spec.ts`  | Create | End-date exclusivity, color mapping, `allDay` handling                |
| `packages/schedule/src/fc-event-to-dates.ts`      | Create | Inverse mapper: FC drag/resize callback → `{ startDate, dueDate }`    |
| `packages/schedule/src/fc-event-to-dates.spec.ts` | Create | Drag semantics tests (shift / resize-start / resize-due / pin / drop) |
| `packages/schedule/src/ScheduleCalendar.tsx`      | Create | Main component — FullCalendar wrapper + callbacks                     |
| `packages/schedule/src/ScheduleCalendar.spec.tsx` | Create | Integration test                                                      |
| `packages/schedule/src/ScheduleToolbar.tsx`       | Create | Week / Month / Day / custom-range toggle + prev/next/today            |
| `packages/schedule/src/ScheduleToolbar.spec.tsx`  | Create | View toggle + nav tests                                               |
| `packages/schedule/src/UnscheduledPanel.tsx`      | Create | Generic draggable list with search                                    |
| `packages/schedule/src/UnscheduledPanel.spec.tsx` | Create | Search filtering + `Draggable` init test                              |
| `packages/schedule/src/FilterFirstEmptyState.tsx` | Create | Soft empty state above N-item threshold                               |
| `packages/schedule/src/schedule-theme.css`        | Create | FC CSS var overrides → `@future/ui` design tokens                     |
| `packages/schedule/README.md`                     | Create | Package overview + usage example                                      |

### Planner integration (host)

| File                                                         | Action  | Purpose                                                                |
| ------------------------------------------------------------ | ------- | ---------------------------------------------------------------------- |
| `apps/web-planner/package.json`                              | Modify  | `bun add -F @future/web-planner @future/schedule`                      |
| `apps/web-planner/src/lib/hooks/usePlannerSchedule.ts`       | Create  | Adapter: `TaskFlat → ScheduleItem`, wires `onDateChange` to `setDates` |
| `apps/web-planner/src/lib/hooks/usePlannerSchedule.spec.ts`  | Create  | Adapter test                                                           |
| `apps/web-planner/src/app/plans/[id]/schedule/page.tsx`      | Replace | Drop ComingSoon; render `<ScheduleCalendar />` via the adapter         |
| `apps/web-planner/e2e/schedule.e2e.ts`                       | Create  | Playwright: drag bar + drop unscheduled item                           |
| `apps/web-planner/src/components/view-picker/ViewPicker.tsx` | Modify  | Enable Schedule tab when `planner.schedule.enabled` is on              |

---

## Task 1 — Scaffold the `@future/schedule` package

- [ ] **Step 1: Generate the workspace** using the project's preferred generator.

```bash
turbo gen workspace
```

When prompted:

- Type: `package`
- Name: `@future/schedule`
- Copy from: `@future/charts` (closest template — React component package)

If `turbo gen workspace` is not configured, copy `packages/charts/` structurally:

```bash
cp -R packages/charts packages/schedule
rm -rf packages/schedule/src/*
```

- [ ] **Step 2: Adjust `packages/schedule/package.json`.**

```json
{
  "name": "@future/schedule",
  "version": "0.0.1",
  "private": true,
  "exports": {
    ".": { "import": "./src/index.ts", "types": "./src/index.ts" },
    "./styles.css": { "import": "./src/schedule-theme.css" }
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/",
    "test:unit": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:watch": "vitest"
  },
  "peerDependencies": {
    "react": "^19.2.5",
    "react-dom": "^19.2.5"
  },
  "dependencies": {
    "@fullcalendar/core": "^6.1.15",
    "@fullcalendar/react": "^6.1.15",
    "@fullcalendar/daygrid": "^6.1.15",
    "@fullcalendar/interaction": "^6.1.15"
  },
  "devDependencies": {
    "@future/eslint-config": "workspace:*",
    "@future/tsconfig": "workspace:*",
    "@future/ui": "workspace:*",
    "@testing-library/react": "^16.3.2",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitest/coverage-v8": "^4.1.4",
    "eslint": "^10.2.1",
    "happy-dom": "^20.9.0",
    "typescript": "^6.0.3",
    "vitest": "^4.1.4"
  }
}
```

Do **not** add these dependencies by hand-editing. Instead:

```bash
bun add -F @future/schedule @fullcalendar/core @fullcalendar/react @fullcalendar/daygrid @fullcalendar/interaction
bun add -dF @future/schedule @future/eslint-config @future/tsconfig @future/ui @testing-library/react @types/react @types/react-dom @vitest/coverage-v8 eslint happy-dom typescript vitest
```

Then confirm the resulting `package.json` matches the shape above.

- [ ] **Step 3: `tsconfig.json`** matches `packages/charts/tsconfig.json` (extends `@future/tsconfig/react-library.json`).

- [ ] **Step 4: `vitest.config.ts`** mirrors `packages/charts/vitest.config.ts` — happy-dom environment, globals enabled.

- [ ] **Step 5:** Verify licenses.

```bash
for pkg in core react daygrid interaction; do
  echo "@fullcalendar/$pkg:"
  node -p "require('@fullcalendar/$pkg/package.json').license"
done
```

Expected: `MIT` for all four. No `@fullcalendar/resource*` or `@fullcalendar/scheduler` present.

- [ ] **Step 6:** Commit scaffold.

```bash
git add packages/schedule/ bun.lock
git commit -m "feat(schedule): scaffold @future/schedule package (FC standard/MIT plugins only)"
```

---

## Task 2 — Public types (`types.ts`)

**Files:**

- Create: `packages/schedule/src/types.ts`

- [ ] **Step 1:** Define the public types.

```ts
// packages/schedule/src/types.ts

/** Domain-agnostic schedule item. Host apps map their own entities to this shape. */
export type ScheduleItem<TPayload = unknown> = {
  id: string
  title: string
  /** ISO 8601 datetime string, or null if unscheduled. */
  startDate: string | null
  /** ISO 8601 datetime string, or null if unscheduled. */
  dueDate: string | null
  /** Optional CSS color value (e.g., `var(--chart-priority-urgent)` or `#ff6b6b`). */
  color?: string
  /** Optional per-item opaque token for optimistic-concurrency. Passed back unchanged on changes. */
  version?: string
  /** Arbitrary host payload ferried through to event handlers. Never touched by the package. */
  payload?: TPayload
}

/** View identifiers accepted by ScheduleCalendar + ScheduleToolbar. */
export type ScheduleView =
  | 'dayGridMonth'
  | 'dayGridWeek'
  | 'dayGridDay'
  | 'dayGridYear'
  | 'dayGridCustom'

/** Kind of user-initiated change from a drag or resize gesture. */
export type DragKind = 'bar' | 'pin' | 'unscheduled-drop'

/** Result of resolving a FullCalendar drag/resize back to domain dates. */
export type DragResolution = { startDate: string | null; dueDate: string }

/** Emitted by ScheduleCalendar when the user changes an item's dates. */
export type ScheduleChange<TPayload = unknown> = {
  id: string
  version?: string
  payload?: TPayload
  kind: DragKind
  next: DragResolution
}

/** Emitted when the user drags a scheduled item back onto the Unscheduled panel. */
export type ScheduleClear<TPayload = unknown> = {
  id: string
  version?: string
  payload?: TPayload
}

/** Classification used internally; exported for consumers that want to pre-partition. */
export type ScheduleClass = 'bar' | 'pin' | 'unscheduled'
```

- [ ] **Step 2:** No tests for types alone — verified by downstream tests.

- [ ] **Step 3:** Commit.

---

## Task 3 — `schedule-render` classifier (TDD)

**Files:**

- Create: `packages/schedule/src/schedule-render.ts`
- Create: `packages/schedule/src/schedule-render.spec.ts`

- [ ] **Step 1: Write tests.**

```ts
// schedule-render.spec.ts
import { describe, expect, it } from 'vitest'
import { classifyItem, partitionItems } from './schedule-render'
import type { ScheduleItem } from './types'

const mk = (p: Partial<ScheduleItem>): ScheduleItem => ({
  id: 'x',
  title: 'x',
  startDate: null,
  dueDate: null,
  ...p,
})

describe('classifyItem (MS-planner preservePinSemantics=true, default)', () => {
  it.each([
    [{ startDate: '2026-04-10T00:00Z', dueDate: '2026-04-12T00:00Z' }, 'bar'],
    [{ startDate: null, dueDate: '2026-04-12T00:00Z' }, 'pin'],
    [{ startDate: '2026-04-10T00:00Z', dueDate: null }, 'unscheduled'],
    [{ startDate: null, dueDate: null }, 'unscheduled'],
  ])('classifies %o → %s', (partial, expected) => {
    expect(classifyItem(mk(partial))).toBe(expected)
  })
})

describe('classifyItem with preservePinSemantics=false', () => {
  it('start-only task renders as a 1-day pin on the start date (no MS-parity)', () => {
    expect(
      classifyItem(mk({ startDate: '2026-04-10T00:00Z' }), { preservePinSemantics: false }),
    ).toBe('pin')
  })
})

describe('partitionItems', () => {
  it('splits into bars / pins / unscheduled', () => {
    const out = partitionItems([
      mk({ id: '1', startDate: '2026-04-10T00:00Z', dueDate: '2026-04-12T00:00Z' }),
      mk({ id: '2', dueDate: '2026-04-15T00:00Z' }),
      mk({ id: '3' }),
    ])
    expect(out.bars.map((x) => x.id)).toEqual(['1'])
    expect(out.pins.map((x) => x.id)).toEqual(['2'])
    expect(out.unscheduled.map((x) => x.id)).toEqual(['3'])
  })
})
```

- [ ] **Step 2: Run — fail.**

- [ ] **Step 3: Implement.**

```ts
// schedule-render.ts
import type { ScheduleClass, ScheduleItem } from './types'

export type ClassifyOpts = { preservePinSemantics?: boolean }

export function classifyItem(item: ScheduleItem, opts: ClassifyOpts = {}): ScheduleClass {
  const preservePin = opts.preservePinSemantics ?? true
  if (item.startDate && item.dueDate) return 'bar'
  if (!item.startDate && item.dueDate) return 'pin'
  if (item.startDate && !item.dueDate) return preservePin ? 'unscheduled' : 'pin'
  return 'unscheduled'
}

export function partitionItems(
  items: ScheduleItem[],
  opts: ClassifyOpts = {},
): {
  bars: ScheduleItem[]
  pins: ScheduleItem[]
  unscheduled: ScheduleItem[]
} {
  const bars: ScheduleItem[] = []
  const pins: ScheduleItem[] = []
  const unscheduled: ScheduleItem[] = []
  for (const it of items) {
    const c = classifyItem(it, opts)
    if (c === 'bar') bars.push(it)
    else if (c === 'pin') pins.push(it)
    else unscheduled.push(it)
  }
  return { bars, pins, unscheduled }
}
```

- [ ] **Step 4: Run — pass.**
- [ ] **Step 5:** Commit.

---

## Task 4 — `item-to-fc-event` mapper (TDD)

**Files:**

- Create: `packages/schedule/src/item-to-fc-event.ts`
- Create: `packages/schedule/src/item-to-fc-event.spec.ts`

FullCalendar uses **exclusive end-date** semantics for all-day events. This mapper bridges our inclusive `dueDate` to FC's exclusive `end`.

- [ ] **Step 1: Write tests.**

```ts
// item-to-fc-event.spec.ts
import { describe, expect, it } from 'vitest'
import { itemToFcEvent } from './item-to-fc-event'

describe('itemToFcEvent', () => {
  it('bar: exclusive end is dueDate + 1 day (all-day)', () => {
    const ev = itemToFcEvent({
      id: '1',
      title: 'A',
      startDate: '2026-04-10T00:00Z',
      dueDate: '2026-04-12T00:00Z',
    })
    expect(ev).toMatchObject({
      id: '1',
      title: 'A',
      start: '2026-04-10',
      end: '2026-04-13',
      allDay: true,
      extendedProps: { kind: 'bar' },
    })
  })

  it('pin: single all-day event on the due date', () => {
    const ev = itemToFcEvent({ id: '2', title: 'B', startDate: null, dueDate: '2026-04-15T00:00Z' })
    expect(ev).toMatchObject({
      start: '2026-04-15',
      end: '2026-04-16',
      extendedProps: { kind: 'pin' },
    })
  })

  it('unscheduled → null', () => {
    expect(itemToFcEvent({ id: '3', title: 'C', startDate: null, dueDate: null })).toBeNull()
  })

  it('copies color into backgroundColor; omits when absent', () => {
    const withColor = itemToFcEvent({
      id: '4',
      title: 'D',
      startDate: null,
      dueDate: '2026-04-20T00:00Z',
      color: 'var(--x)',
    })
    expect(withColor?.backgroundColor).toBe('var(--x)')
    const withoutColor = itemToFcEvent({
      id: '5',
      title: 'E',
      startDate: null,
      dueDate: '2026-04-20T00:00Z',
    })
    expect(withoutColor?.backgroundColor).toBeUndefined()
  })

  it('ferries version + payload through extendedProps', () => {
    const ev = itemToFcEvent({
      id: '6',
      title: 'F',
      startDate: null,
      dueDate: '2026-04-20T00:00Z',
      version: 'v1',
      payload: { foo: 42 },
    })
    expect(ev?.extendedProps).toMatchObject({ version: 'v1', payload: { foo: 42 } })
  })

  it('honors preservePinSemantics=false: start-only becomes a pin on the start date', () => {
    const ev = itemToFcEvent(
      { id: '7', title: 'G', startDate: '2026-04-20T00:00Z', dueDate: null },
      { preservePinSemantics: false },
    )
    expect(ev).toMatchObject({
      start: '2026-04-20',
      end: '2026-04-21',
      extendedProps: { kind: 'pin' },
    })
  })
})
```

- [ ] **Step 2: Run — fail.**

- [ ] **Step 3: Implement.**

```ts
// item-to-fc-event.ts
import type { EventInput } from '@fullcalendar/core'
import type { ScheduleItem } from './types'
import { classifyItem, type ClassifyOpts } from './schedule-render'

export function itemToFcEvent(item: ScheduleItem, opts: ClassifyOpts = {}): EventInput | null {
  const kind = classifyItem(item, opts)
  if (kind === 'unscheduled') return null

  // Anchor date depends on kind:
  //   bar → startDate; pin → dueDate (or startDate when preservePinSemantics=false)
  const anchorIso = kind === 'bar' ? item.startDate! : (item.dueDate ?? item.startDate!)
  const endAnchorIso = item.dueDate ?? item.startDate!

  const startIso = isoDate(anchorIso)
  const endExclusiveIso = isoDate(addDays(new Date(endAnchorIso), 1))

  const ev: EventInput = {
    id: item.id,
    title: item.title,
    start: startIso,
    end: endExclusiveIso,
    allDay: true,
    extendedProps: {
      kind,
      itemId: item.id,
      version: item.version,
      payload: item.payload,
    },
  }
  if (item.color) ev.backgroundColor = item.color
  return ev
}

function isoDate(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}
function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000)
}
```

- [ ] **Step 4: Run — pass.**
- [ ] **Step 5:** Commit.

---

## Task 5 — `fc-event-to-dates` inverse mapper (TDD)

**Files:**

- Create: `packages/schedule/src/fc-event-to-dates.ts`
- Create: `packages/schedule/src/fc-event-to-dates.spec.ts`

- [ ] **Step 1: Write tests.**

```ts
// fc-event-to-dates.spec.ts
import { describe, expect, it } from 'vitest'
import { resolveFcChange } from './fc-event-to-dates'

describe('resolveFcChange', () => {
  it('bar shift/resize: inclusive dueDate = end - 1 day', () => {
    expect(
      resolveFcChange({
        kind: 'bar',
        newStart: new Date('2026-04-13T00:00Z'),
        newEnd: new Date('2026-04-16T00:00Z'),
      }),
    ).toEqual({ startDate: '2026-04-13', dueDate: '2026-04-15' })
  })

  it('pin shift: startDate stays null; dueDate = start day', () => {
    expect(
      resolveFcChange({
        kind: 'pin',
        newStart: new Date('2026-04-17T00:00Z'),
        newEnd: new Date('2026-04-18T00:00Z'),
      }),
    ).toEqual({ startDate: null, dueDate: '2026-04-17' })
  })

  it('unscheduled-drop: startDate = dueDate = drop day', () => {
    expect(
      resolveFcChange({
        kind: 'unscheduled-drop',
        newStart: new Date('2026-04-20T00:00Z'),
        newEnd: new Date('2026-04-21T00:00Z'),
      }),
    ).toEqual({ startDate: '2026-04-20', dueDate: '2026-04-20' })
  })
})
```

- [ ] **Step 2: Run — fail.**

- [ ] **Step 3: Implement.**

```ts
// fc-event-to-dates.ts
import type { DragKind, DragResolution } from './types'

export function resolveFcChange({
  kind,
  newStart,
  newEnd,
}: {
  kind: DragKind
  newStart: Date
  newEnd: Date
}): DragResolution {
  const startDay = isoDate(newStart)
  const dueDay = isoDate(addDays(newEnd, -1)) // FC end exclusive → inclusive

  switch (kind) {
    case 'bar':
      return { startDate: startDay, dueDate: dueDay }
    case 'pin':
      return { startDate: null, dueDate: startDay }
    case 'unscheduled-drop':
      return { startDate: startDay, dueDate: startDay }
  }
}

function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}
function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000)
}
```

- [ ] **Step 4: Run — pass.**
- [ ] **Step 5:** Commit.

---

## Task 6 — `UnscheduledPanel` (generic, TDD)

**Files:**

- Create: `packages/schedule/src/UnscheduledPanel.tsx`
- Create: `packages/schedule/src/UnscheduledPanel.spec.tsx`

- [ ] **Step 1: Test.**

```tsx
// UnscheduledPanel.spec.tsx
it('lists unscheduled items and filters by search', async () => {
  render(
    <UnscheduledPanel
      items={[
        { id: '1', title: 'Alpha', startDate: null, dueDate: null },
        { id: '2', title: 'Bravo', startDate: null, dueDate: null },
      ]}
    />,
  )
  await userEvent.type(screen.getByRole('searchbox'), 'brv')
  expect(screen.queryByText('Alpha')).toBeNull()
  expect(screen.getByText('Bravo')).toBeInTheDocument()
})

it('each item carries data-event JSON consumed by FullCalendar Draggable', () => {
  render(
    <UnscheduledPanel
      items={[{ id: '1', title: 'Alpha', startDate: null, dueDate: null, version: 'v7' }]}
    />,
  )
  const el = screen.getByTestId('unscheduled-item-1')
  const data = JSON.parse(el.getAttribute('data-event')!)
  expect(data).toMatchObject({
    title: 'Alpha',
    allDay: true,
    extendedProps: { itemId: '1', kind: 'unscheduled-drop', version: 'v7' },
  })
})

it('renders a custom item via the `renderItem` slot', () => {
  render(
    <UnscheduledPanel
      items={[{ id: '1', title: 'X', startDate: null, dueDate: null }]}
      renderItem={(it) => <span data-testid="custom">{it.title}!!</span>}
    />,
  )
  expect(screen.getByTestId('custom')).toHaveTextContent('X!!')
})
```

- [ ] **Step 2: Run — fail.**

- [ ] **Step 3: Implement.**

```tsx
// UnscheduledPanel.tsx
'use client'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Draggable } from '@fullcalendar/interaction'
import type { ScheduleItem } from './types'

export type UnscheduledPanelProps<TPayload = unknown> = {
  items: ScheduleItem<TPayload>[]
  title?: string
  emptyLabel?: string
  /** Slot for host apps to render a custom item (e.g., planner renders title + priority + label pills). */
  renderItem?: (item: ScheduleItem<TPayload>) => ReactNode
  /** Called when the search input changes, for host-side analytics. Optional. */
  onSearchChange?: (q: string) => void
}

export function UnscheduledPanel<TPayload = unknown>({
  items,
  title = 'Unscheduled',
  emptyLabel = 'No items',
  renderItem,
  onSearchChange,
}: UnscheduledPanelProps<TPayload>) {
  const containerRef = useRef<HTMLUListElement | null>(null)
  const [search, setSearch] = useState('')
  const filtered = useMemo(
    () => items.filter((it) => it.title.toLowerCase().includes(search.toLowerCase())),
    [items, search],
  )

  useEffect(() => {
    if (!containerRef.current) return
    const draggable = new Draggable(containerRef.current, {
      itemSelector: '[data-event]',
      eventData: (el) => JSON.parse(el.getAttribute('data-event') ?? '{}'),
    })
    return () => draggable.destroy()
  }, [])

  return (
    <aside className="fcx-unscheduled flex w-72 flex-col border-l border-border">
      <header className="flex items-center justify-between px-4 py-3">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{filtered.length}</span>
      </header>
      <div className="px-4 pb-2">
        <input
          role="searchbox"
          type="search"
          placeholder="Search…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            onSearchChange?.(e.target.value)
          }}
          className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
        />
      </div>
      <ul ref={containerRef} className="flex-1 space-y-1 overflow-auto px-4 pb-4">
        {filtered.length === 0 && <li className="text-xs text-muted-foreground">{emptyLabel}</li>}
        {filtered.map((it) => (
          <li
            key={it.id}
            data-testid={`unscheduled-item-${it.id}`}
            data-event={JSON.stringify({
              title: it.title,
              allDay: true,
              duration: { days: 1 },
              extendedProps: {
                itemId: it.id,
                kind: 'unscheduled-drop',
                version: it.version,
                payload: it.payload,
              },
            })}
            className="cursor-grab rounded border border-border bg-background px-2 py-1.5 text-sm hover:bg-muted"
          >
            {renderItem ? renderItem(it) : it.title}
          </li>
        ))}
      </ul>
    </aside>
  )
}
```

Note: we use a raw `<input type="search">` here instead of `<Input>` from `@future/ui` because the package's peer dependency on `@future/ui` is fine but keeping dependency surface small helps reuse; host apps that want full `@future/ui` polish can pass a custom `renderItem` or wrap the panel. Revisit if this becomes a pain point.

- [ ] **Step 4: Run — pass.**
- [ ] **Step 5:** Commit.

---

## Task 7 — `ScheduleToolbar` (generic, TDD)

**Files:**

- Create: `packages/schedule/src/ScheduleToolbar.tsx`
- Create: `packages/schedule/src/ScheduleToolbar.spec.tsx`

- [ ] **Step 1: Test** — view toggle calls `onViewChange`; prev/next/today invoke methods on the passed FC ref.

- [ ] **Step 2: Implement.**

```tsx
// ScheduleToolbar.tsx
'use client'
import type { RefObject } from 'react'
import type FullCalendar from '@fullcalendar/react'
import type { ScheduleView } from './types'

export type ScheduleToolbarProps = {
  view: ScheduleView
  onViewChange: (v: ScheduleView) => void
  calendarRef: RefObject<FullCalendar | null>
  /** Views to expose in the toggle. Defaults to ['dayGridWeek', 'dayGridMonth']. */
  views?: ScheduleView[]
}

const VIEW_LABELS: Record<ScheduleView, string> = {
  dayGridDay: 'Day',
  dayGridWeek: 'Week',
  dayGridMonth: 'Month',
  dayGridYear: 'Year',
  dayGridCustom: 'Custom',
}

export function ScheduleToolbar({
  view,
  onViewChange,
  calendarRef,
  views = ['dayGridWeek', 'dayGridMonth'],
}: ScheduleToolbarProps) {
  const nav = (fn: 'prev' | 'next' | 'today') => () => calendarRef.current?.getApi()[fn]()
  const set = (v: ScheduleView) => {
    onViewChange(v)
    calendarRef.current?.getApi().changeView(v)
  }
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={nav('prev')}
        aria-label="Previous"
        className="rounded px-2 py-1 text-sm hover:bg-muted"
      >
        ‹
      </button>
      <button onClick={nav('today')} className="rounded px-2 py-1 text-sm hover:bg-muted">
        Today
      </button>
      <button
        onClick={nav('next')}
        aria-label="Next"
        className="rounded px-2 py-1 text-sm hover:bg-muted"
      >
        ›
      </button>
      <div role="tablist" className="ml-2 flex rounded border border-border">
        {views.map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            onClick={() => set(v)}
            className={`px-3 py-1 text-sm ${view === v ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          >
            {VIEW_LABELS[v]}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run — pass.**
- [ ] **Step 4:** Commit.

---

## Task 8 — `FilterFirstEmptyState` (generic)

**Files:**

- Create: `packages/schedule/src/FilterFirstEmptyState.tsx`

- [ ] **Step 1: Test** — renders message + calls `onShowAll` when clicked.

- [ ] **Step 2: Implement** as a generic card with customizable copy:

```tsx
export type FilterFirstEmptyStateProps = {
  itemCount: number
  threshold: number
  title?: string
  description?: string
  showAllLabel?: string
  onShowAll: () => void
}
```

- [ ] **Step 3:** Commit.

---

## Task 9 — `ScheduleCalendar` component (TDD)

**Files:**

- Create: `packages/schedule/src/ScheduleCalendar.tsx`
- Create: `packages/schedule/src/ScheduleCalendar.spec.tsx`

- [ ] **Step 1: Test** the component behavior.

Assertions:

1. Renders FullCalendar with the `initialView` and `plugins={[dayGridPlugin, interactionPlugin]}`.
2. Maps `items` through `itemToFcEvent` and passes only non-null events to FC.
3. `eventDrop` fires `onChange` with `{ kind: event.extendedProps.kind, next: resolved, ...item metadata }`.
4. `eventResize` fires `onChange` with `kind: 'bar'`.
5. External `drop` fires `onChange` with `kind: 'unscheduled-drop'`.
6. Clicking an event calls `onItemClick` with the original item id.
7. `itemCount > threshold && !filtered` → renders `<FilterFirstEmptyState>` instead of the calendar (when `filterFirstThreshold` prop provided).
8. `readOnly` prop disables `editable` and `droppable`.

- [ ] **Step 2: Run — fail.**

- [ ] **Step 3: Implement.**

```tsx
// ScheduleCalendar.tsx
'use client'
import {
  useImperativeHandle,
  useMemo,
  useRef,
  forwardRef,
  type ForwardedRef,
  type ReactNode,
} from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import type {
  EventInput,
  EventApi,
  DropArg,
  EventDropArg,
  EventResizeDoneArg,
} from '@fullcalendar/core'
import { partitionItems } from './schedule-render'
import { itemToFcEvent } from './item-to-fc-event'
import { resolveFcChange } from './fc-event-to-dates'
import { UnscheduledPanel, type UnscheduledPanelProps } from './UnscheduledPanel'
import { ScheduleToolbar } from './ScheduleToolbar'
import { FilterFirstEmptyState } from './FilterFirstEmptyState'
import type { DragKind, ScheduleChange, ScheduleClear, ScheduleItem, ScheduleView } from './types'

export type ScheduleCalendarProps<TPayload = unknown> = {
  items: ScheduleItem<TPayload>[]
  view: ScheduleView
  onViewChange: (v: ScheduleView) => void
  onChange: (ev: ScheduleChange<TPayload>) => void
  onClear?: (ev: ScheduleClear<TPayload>) => void
  onItemClick?: (item: ScheduleItem<TPayload>) => void

  /** Views shown in the toolbar toggle. Default: ['dayGridWeek', 'dayGridMonth']. */
  availableViews?: ScheduleView[]

  /** Rendered above the calendar — host-provided filter/search bar, etc. */
  headerSlot?: ReactNode
  /** Passed through to UnscheduledPanel `renderItem`. */
  renderUnscheduledItem?: UnscheduledPanelProps<TPayload>['renderItem']
  /** Panel title label. */
  unscheduledPanelTitle?: string
  /** Hide the panel entirely (e.g., for display-only calendars). */
  hideUnscheduledPanel?: boolean

  /** Disable editing — bars are non-draggable, no external drop. */
  readOnly?: boolean

  /** Opt in to soft empty state above this threshold when `items.length > threshold && !hasFilter`. */
  filterFirstThreshold?: number
  hasFilterApplied?: boolean

  /** MS-planner pin semantics; default true. Set false to render start-only items as pins. */
  preservePinSemantics?: boolean

  /** Extra props passed straight to <FullCalendar /> for power users. */
  calendarProps?: Record<string, unknown>
}

export type ScheduleCalendarRef = { getApi: () => ReturnType<FullCalendar['getApi']> | undefined }

export const ScheduleCalendar = forwardRef(function ScheduleCalendar<TPayload>(
  props: ScheduleCalendarProps<TPayload>,
  ref: ForwardedRef<ScheduleCalendarRef>,
) {
  const {
    items,
    view,
    onViewChange,
    onChange,
    onClear,
    onItemClick,
    availableViews,
    headerSlot,
    renderUnscheduledItem,
    unscheduledPanelTitle,
    hideUnscheduledPanel = false,
    readOnly = false,
    filterFirstThreshold,
    hasFilterApplied = false,
    preservePinSemantics = true,
    calendarProps = {},
  } = props

  const calendarRef = useRef<FullCalendar | null>(null)
  useImperativeHandle(
    ref,
    () => ({
      getApi: () => calendarRef.current?.getApi(),
    }),
    [],
  )

  const { bars, pins, unscheduled } = useMemo(
    () => partitionItems(items, { preservePinSemantics }),
    [items, preservePinSemantics],
  )

  const events = useMemo<EventInput[]>(
    () =>
      [...bars, ...pins]
        .map((it) => itemToFcEvent(it, { preservePinSemantics }))
        .filter((e): e is EventInput => e !== null),
    [bars, pins, preservePinSemantics],
  )

  const exceedsThreshold =
    typeof filterFirstThreshold === 'number' &&
    !hasFilterApplied &&
    items.length > filterFirstThreshold

  if (exceedsThreshold) {
    return (
      <FilterFirstEmptyState
        itemCount={items.length}
        threshold={filterFirstThreshold!}
        onShowAll={() => {
          /* host must flip hasFilterApplied via ScheduleToolbar header slot */
        }}
      />
    )
  }

  const handleEventChange = (fcEvent: EventApi, kind: DragKind) => {
    const end = fcEvent.end ?? new Date(fcEvent.start!.getTime() + 86_400_000)
    const next = resolveFcChange({ kind, newStart: fcEvent.start!, newEnd: end })
    onChange({
      id: fcEvent.extendedProps.itemId as string,
      version: fcEvent.extendedProps.version as string | undefined,
      payload: fcEvent.extendedProps.payload as TPayload | undefined,
      kind,
      next,
    })
  }

  const handleExternalDrop = (arg: DropArg) => {
    const payload = JSON.parse(arg.draggedEl.getAttribute('data-event') ?? '{}')
    const id = payload.extendedProps?.itemId as string | undefined
    if (!id) return
    const next = resolveFcChange({
      kind: 'unscheduled-drop',
      newStart: arg.date,
      newEnd: new Date(arg.date.getTime() + 86_400_000),
    })
    onChange({
      id,
      version: payload.extendedProps?.version,
      payload: payload.extendedProps?.payload,
      kind: 'unscheduled-drop',
      next,
    })
  }

  const handleEventClick = (arg: { event: EventApi }) => {
    if (!onItemClick) return
    const id = arg.event.extendedProps.itemId as string
    const source = items.find((x) => x.id === id)
    if (source) onItemClick(source)
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <ScheduleToolbar
            view={view}
            onViewChange={onViewChange}
            calendarRef={calendarRef}
            views={availableViews}
          />
          {headerSlot}
        </div>
        <div className="flex-1 overflow-auto">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView={view}
            headerToolbar={false}
            height="100%"
            editable={!readOnly}
            droppable={!readOnly}
            events={events}
            eventDrop={(info: EventDropArg) =>
              handleEventChange(info.event, info.event.extendedProps.kind as DragKind)
            }
            eventResize={(info: EventResizeDoneArg) => handleEventChange(info.event, 'bar')}
            drop={handleExternalDrop}
            eventClick={handleEventClick}
            firstDay={1}
            weekNumbers={false}
            eventDisplay="block"
            {...calendarProps}
          />
        </div>
      </div>
      {!hideUnscheduledPanel && (
        <UnscheduledPanel<TPayload>
          items={unscheduled}
          title={unscheduledPanelTitle}
          renderItem={renderUnscheduledItem}
        />
      )}
    </div>
  )
}) as <TPayload = unknown>(
  props: ScheduleCalendarProps<TPayload> & { ref?: ForwardedRef<ScheduleCalendarRef> },
) => ReactNode
```

- [ ] **Step 4: Run — pass.**
- [ ] **Step 5:** Commit.

---

## Task 10 — CSS theming (`schedule-theme.css`)

**Files:**

- Create: `packages/schedule/src/schedule-theme.css`

FullCalendar v6 auto-injects its own base CSS; we override via the documented `--fc-*` CSS variables so consumers get DESIGN.md-consistent visuals "for free" once they import the stylesheet.

- [ ] **Step 1:** Create the stylesheet.

```css
/* packages/schedule/src/schedule-theme.css */
.fc {
  --fc-border-color: var(--border);
  --fc-page-bg-color: var(--background);
  --fc-neutral-bg-color: var(--muted);
  --fc-today-bg-color: color-mix(in oklch, var(--primary) 8%, var(--background));
  --fc-event-bg-color: var(--primary);
  --fc-event-border-color: transparent;
  --fc-event-text-color: var(--primary-foreground);
  --fc-highlight-color: color-mix(in oklch, var(--primary) 20%, transparent);
  font-family: inherit;
}

.fc .fc-daygrid-day-number {
  color: var(--muted-foreground);
  font-size: 0.75rem;
}
.fc .fc-col-header-cell-cushion {
  font-weight: 500;
  font-size: 0.75rem;
}
.fc .fc-event {
  border-radius: var(--radius-sm);
  padding: 2px 6px;
}
.fc .fc-event:focus {
  outline: 2px solid var(--ring);
  outline-offset: 1px;
}

/* keyboard focus on unscheduled panel items */
.fcx-unscheduled li:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 1px;
}
```

- [ ] **Step 2:** Document in `packages/schedule/README.md` that consumers must import the stylesheet once:

```tsx
// host app
import '@future/schedule/styles.css'
```

- [ ] **Step 3:** Commit.

---

## Task 11 — `index.ts` barrel + `README.md`

**Files:**

- Create: `packages/schedule/src/index.ts`
- Create: `packages/schedule/README.md`

- [ ] **Step 1: Barrel exports.**

```ts
// packages/schedule/src/index.ts
export type {
  ScheduleItem,
  ScheduleView,
  ScheduleChange,
  ScheduleClear,
  ScheduleClass,
  DragKind,
  DragResolution,
} from './types'

export { classifyItem, partitionItems } from './schedule-render'
export type { ClassifyOpts } from './schedule-render'
export { itemToFcEvent } from './item-to-fc-event'
export { resolveFcChange } from './fc-event-to-dates'

export { ScheduleCalendar } from './ScheduleCalendar'
export type { ScheduleCalendarProps, ScheduleCalendarRef } from './ScheduleCalendar'

export { ScheduleToolbar } from './ScheduleToolbar'
export type { ScheduleToolbarProps } from './ScheduleToolbar'

export { UnscheduledPanel } from './UnscheduledPanel'
export type { UnscheduledPanelProps } from './UnscheduledPanel'

export { FilterFirstEmptyState } from './FilterFirstEmptyState'
export type { FilterFirstEmptyStateProps } from './FilterFirstEmptyState'
```

- [ ] **Step 2: README with a minimum-viable usage example** (generic + pin semantics + headerSlot).

- [ ] **Step 3: Build the package.**

```bash
bun run --filter @future/schedule build
bun run --filter @future/schedule typecheck
bun run --filter @future/schedule test:unit
```

All three should pass.

- [ ] **Step 4:** Commit.

```bash
git add packages/schedule/
git commit -m "feat(schedule): @future/schedule v0.0.1 — generic day-granular calendar"
```

---

## Task 12 — Planner adapter hook

**Files:**

- Create: `apps/web-planner/src/lib/hooks/usePlannerSchedule.ts`
- Create: `apps/web-planner/src/lib/hooks/usePlannerSchedule.spec.ts`
- Modify: `apps/web-planner/package.json` (`bun add -F @future/web-planner @future/schedule`)

The adapter bridges the generic `@future/schedule` package to planner-specific concerns:

1. Maps `TaskFlat → ScheduleItem<TaskFlat>` (ferries the full task through `payload` for item-click).
2. Wires `onChange` to `trpc.planner.tasks.setDates.useMutation` with optimistic update.
3. Wires `onClear` to the same mutation with `{ startDate: null, dueDate: null }` behind a confirmation dialog.
4. Maps the group-by state to a per-item `color` using chart tokens.

- [ ] **Step 1: Install the workspace dependency.**

```bash
bun add -F @future/web-planner @future/schedule
```

- [ ] **Step 2: Write test** for the adapter's mapping and change-handlers.

```ts
// usePlannerSchedule.spec.ts
describe('usePlannerSchedule', () => {
  it('maps TaskFlat.assignees & priority to a colored ScheduleItem when groupBy=priority', () => {
    /* … */
  })
  it('onChange invokes setDates with the inclusive dueDate', () => {
    /* … */
  })
  it('onClear shows a confirmation dialog and then clears both dates on confirm', () => {
    /* … */
  })
})
```

- [ ] **Step 3: Implement the adapter.**

```ts
// usePlannerSchedule.ts
'use client'
import { useCallback, useMemo } from 'react'
import type { ScheduleChange, ScheduleClear, ScheduleItem } from '@future/schedule'
import type { TaskFlat } from '@future/api-client/planner'
import { trpc } from '@/lib/trpc'
import { useViewState } from '@/lib/view-state'
import { useConfirmDialog } from '@/lib/hooks/useConfirmDialog'

export function usePlannerSchedule(planId: string, tasks: TaskFlat[]) {
  const { state } = useViewState({ planId })
  const setDates = trpc.planner.tasks.setDates.useMutation()
  const confirm = useConfirmDialog()

  const items = useMemo<ScheduleItem<TaskFlat>[]>(
    () =>
      tasks.map((t) => ({
        id: t.id,
        title: t.title,
        startDate: t.startDate,
        dueDate: t.dueDate,
        color: colorForGroup(t, state.groupBy),
        version: t.updatedAt,
        payload: t,
      })),
    [tasks, state.groupBy],
  )

  const onChange = useCallback(
    (ev: ScheduleChange<TaskFlat>) => {
      setDates.mutate({
        taskId: ev.id,
        startDate: ev.next.startDate,
        dueDate: ev.next.dueDate,
        expectedVersion: ev.version!,
      })
    },
    [setDates],
  )

  const onClear = useCallback(
    (ev: ScheduleClear<TaskFlat>) => {
      confirm.confirm({
        title: 'Remove dates?',
        description: 'The task will move back to Unscheduled.',
        onConfirm: () =>
          setDates.mutate({
            taskId: ev.id,
            startDate: null,
            dueDate: null,
            expectedVersion: ev.version!,
          }),
      })
    },
    [confirm, setDates],
  )

  return { items, onChange, onClear }
}

function colorForGroup(t: TaskFlat, groupBy: string): string | undefined {
  switch (groupBy) {
    case 'priority':
      return `var(--chart-priority-${t.priority})`
    case 'progress':
      return `var(--chart-progress-${t.progress})`
    case 'bucket':
      return undefined // bucket color map lives in zone tokens; follow-up
    default:
      return undefined
  }
}
```

- [ ] **Step 4:** Run tests. Commit.

```bash
git add apps/web-planner/package.json apps/web-planner/src/lib/hooks/usePlannerSchedule*
git commit -m "feat(web-planner): planner adapter over @future/schedule"
```

---

## Task 13 — Planner Schedule page

**Files:**

- Replace: `apps/web-planner/src/app/plans/[id]/schedule/page.tsx`

- [ ] **Step 1:** Replace ComingSoon with:

```tsx
// page.tsx
'use client'
import { useState } from 'react'
import { ScheduleCalendar, type ScheduleView } from '@future/schedule'
import '@future/schedule/styles.css'
import { useFlatTasks } from '@/lib/hooks/useFlatTasks'
import { usePlannerSchedule } from '@/lib/hooks/usePlannerSchedule'
import { useViewRenderedTelemetry } from '@/lib/hooks/useViewRenderedTelemetry'
import { useViewState } from '@/lib/view-state'
import { Skeleton, Alert, AlertDescription } from '@future/ui'

export default function SchedulePage({ params }: { params: { id: string } }) {
  const { processed, isLoading, error } = useFlatTasks({ planId: params.id })
  const { state, patch } = useViewState({ planId: params.id })
  const view: ScheduleView = state.scale === 'month' ? 'dayGridMonth' : 'dayGridWeek'
  const tasks = processed?.rows ?? []
  const { items, onChange, onClear } = usePlannerSchedule(params.id, tasks)

  useViewRenderedTelemetry({
    view: 'schedule',
    planId: params.id,
    taskCount: tasks.length,
    filterKeys: Object.keys(state.filter).filter((k) => (state.filter as any)[k]?.length),
    groupBy: state.groupBy,
  })

  if (isLoading) return <Skeleton className="h-[60vh]" />
  if (error)
    return (
      <Alert variant="destructive">
        <AlertDescription>Failed to load tasks.</AlertDescription>
      </Alert>
    )

  return (
    <div className="h-[calc(100vh-11rem)]">
      <ScheduleCalendar
        items={items}
        view={view}
        onViewChange={(v) => patch({ scale: v === 'dayGridMonth' ? 'month' : 'week' })}
        onChange={onChange}
        onClear={onClear}
        filterFirstThreshold={150}
        hasFilterApplied={hasAnyFilter(state.filter)}
        availableViews={['dayGridWeek', 'dayGridMonth']}
      />
    </div>
  )
}

function hasAnyFilter(f: ReturnType<typeof useViewState>['state']['filter']): boolean {
  return (
    Boolean(f.due) ||
    f.priority.length > 0 ||
    f.labels.length > 0 ||
    f.buckets.length > 0 ||
    f.assignees.length > 0
  )
}
```

- [ ] **Step 2:** Enable the Schedule tab in ViewPicker when `planner.schedule.enabled` is on.
- [ ] **Step 3:** Commit.

---

## Task 14 — Playwright E2E

**Files:**

- Create: `apps/web-planner/e2e/schedule.e2e.ts`

- [ ] **Step 1:** Seed: 3 bars, 2 pins, 2 unscheduled tasks.
- [ ] **Step 2:** Steps:
  1. Open `/plans/:id/schedule`; assert `dayGridWeek` rendered.
  2. Assert 3 bars + 2 pins on calendar; 2 items in the Unscheduled panel.
  3. Drag bar #1 right by one cell → `tasks.setDates` call; reload, bar on new day.
  4. Drag an unscheduled item onto Friday → `setDates` with both dates = Friday.
  5. Resize right edge of bar #1 one cell right → `setDates({ dueDate: shifted })`.
  6. Toolbar → Month. Assert layout re-renders.
  7. Filter to Priority=Urgent. Assert only urgent events shown.
  8. Drag scheduled bar onto Unscheduled panel → confirm dialog → `setDates({ null, null })`; item moves to panel.
- [ ] **Step 3:** Commit.

---

## Task 15 — Flip `planner.schedule.enabled` for SETA tenant

- [ ] **Step 1:** Flip flag.
- [ ] **Step 2:** Smoke test on staging.
- [ ] **Step 3:** PR.

---

## Acceptance

### Package

- `@future/schedule` builds, typechecks, tests green with ≥70% coverage.
- All MIT plugins — no `schedulerLicenseKey`, no premium imports.
- `ScheduleCalendar` handles: Week / Month views, drag-shift, drag-resize, external drop, item-click, read-only mode, filter-first threshold, configurable unscheduled panel.
- Public API surface is domain-agnostic — no import of task/plan/planner types.

### Planner adoption

- Schedule page renders the calendar via the adapter hook.
- Drag/resize/external-drop fire `tasks.setDates` with correct payload.
- Group-by color-coding works via `colorForGroup` mapping chart tokens.
- Filter-first soft empty state appears for unfiltered plans above 150 tasks.
- E2E flow passes.

## Risks for this plan

| Risk                                                                                                  | Mitigation                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bundling `@future/schedule` increases the `web-planner` bundle ~100 KB (FullCalendar + React wrapper) | Accepted — MS-Planner parity justifies it. Monitor zone bundle size; revisit if multiple zones consume it simultaneously.                                                                            |
| FullCalendar major version upgrades break API surface                                                 | Package pins `^6.1.15`. Visual regression via Playwright snapshot on each bump. Upgrade lives in one file instead of N consumer sites.                                                               |
| Downstream consumers (hiring/time/projects) requiring a feature that doesn't fit the current API      | Package leaves `calendarProps` as an escape hatch for power users. Add dedicated props when ≥2 consumers request the same thing.                                                                     |
| Package's generic `<input type="search">` diverging from DESIGN.md in visuals                         | Host can pass `renderItem` for custom content; follow-up spec could add a styled `Input` from `@future/ui` once that package can be a runtime dep without bundle cost.                               |
| MS-pin semantics leaking into unrelated consumers                                                     | `preservePinSemantics` defaults to true; each consumer opts in/out explicitly. Documented in README.                                                                                                 |
| CSS token collisions between the package's `--fc-*` overrides and multiple FullCalendars on one page  | Scoped under `.fc { … }` — only affects FullCalendar-rendered DOM. Fine.                                                                                                                             |
| Optimistic concurrency races on rapid drag                                                            | Each change ferries the domain `version` (TaskFlat.updatedAt) through `payload → version`; React Query retries on 409 surface via toast.                                                             |
| Future demand for hour-granular scheduling (time-grid)                                                | Package stays day-granular in this iteration. Adding `@fullcalendar/timegrid` is additive — drop the plugin in when the first consumer needs it. Not a breaking change.                              |
| Shared package accidentally importing `@future/ui` into the bundle                                    | Current design keeps `@future/ui` as a dev/peer dep — README tells hosts to pre-import it. Audit the final build with `bun run --filter @future/schedule build` to confirm no UI-package code leaks. |
| CSS `color-mix` unsupported in older browsers                                                         | Target is evergreen; `color-mix` has >95% support as of 2026. Add `@supports` fallback only if QA flags.                                                                                             |
