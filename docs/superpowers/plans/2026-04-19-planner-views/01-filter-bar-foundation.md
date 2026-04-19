# Plan 01 — Filter Bar, Group-by, View Picker, View State Foundation

> Covers spec **Plan 2.1** — see [design spec §6.2–6.4, §9](../../specs/2026-04-19-planner-views-design.md).
> Depends on Sub-project #1 fully merged.

**Goal:** Land the shared view framework that every other plan in Sub-project #2 consumes. Ship the ViewPicker, FilterBar, GroupByPicker, and the `useViewState` hook. Wire the existing Board to the new controls so filtering and group-by work on Board (the only view that exists yet). Grid / Schedule / Charts routes render a `<ComingSoon>` placeholder behind their own flags.

**Architecture:** Pure-client work — no new backend endpoints, no new schema, no new permissions. All filter/group/sort logic lives in pure helper functions under `apps/web-planner/src/lib/`. The `useViewState` hook is the single source of truth for view-level URL + localStorage state; every view component reads from it. The existing Board is adapted to apply `task-filter` / `task-group` over the already-loaded `getBoard` snapshot — no refetch.

**Tech stack:** Next.js app router, React 19, React Query, Zod (URL schema validation), `@future/ui` primitives (Tabs, Popover, Command, Input, Checkbox, Radio), `lucide-react` for icons.

---

## File Map

| File                                                                     | Action | Purpose                                                                                                        |
| ------------------------------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------- |
| `apps/web-planner/src/lib/view-state.ts`                                 | Create | `useViewState()` hook — URL ↔ localStorage view state                                                          |
| `apps/web-planner/src/lib/view-state.spec.ts`                            | Create | Parse/serialize/merge tests                                                                                    |
| `apps/web-planner/src/lib/task-filter.ts`                                | Create | Pure filter function over `TaskFlat[]`                                                                         |
| `apps/web-planner/src/lib/task-filter.spec.ts`                           | Create | Table-driven filter tests                                                                                      |
| `apps/web-planner/src/lib/task-group.ts`                                 | Create | Pure grouper; handles label-cardinality correctly                                                              |
| `apps/web-planner/src/lib/task-group.spec.ts`                            | Create | Group semantics tests per group key                                                                            |
| `apps/web-planner/src/lib/task-sort.ts`                                  | Create | Pure sort helpers per sortable field                                                                           |
| `apps/web-planner/src/lib/task-sort.spec.ts`                             | Create | Table-driven sort tests                                                                                        |
| `apps/web-planner/src/components/view-picker/ViewPicker.tsx`             | Create | Segmented tabs (Board/Grid/Schedule/Charts); flag-aware disable                                                |
| `apps/web-planner/src/components/view-picker/ViewPicker.spec.tsx`        | Create | Navigation + flag disable tests                                                                                |
| `apps/web-planner/src/components/filter-bar/FilterBar.tsx`               | Create | Chips + "Add filter" menu                                                                                      |
| `apps/web-planner/src/components/filter-bar/FilterChip.tsx`              | Create | Single chip with popover trigger                                                                               |
| `apps/web-planner/src/components/filter-bar/FilterPopover.tsx`           | Create | Shell popover — hosts per-filter editor                                                                        |
| `apps/web-planner/src/components/filter-bar/filters/DueFilter.tsx`       | Create | Radio: 7 due buckets                                                                                           |
| `apps/web-planner/src/components/filter-bar/filters/PriorityFilter.tsx`  | Create | Multi-select priority                                                                                          |
| `apps/web-planner/src/components/filter-bar/filters/LabelsFilter.tsx`    | Create | Searchable multi-select over plan labels                                                                       |
| `apps/web-planner/src/components/filter-bar/filters/BucketsFilter.tsx`   | Create | Searchable multi-select over plan buckets                                                                      |
| `apps/web-planner/src/components/filter-bar/filters/AssigneesFilter.tsx` | Create | Searchable multi-select over plan members                                                                      |
| `apps/web-planner/src/components/filter-bar/FilterBar.spec.tsx`          | Create | Chip rendering + Add-filter flow                                                                               |
| `apps/web-planner/src/components/group-by/GroupByPicker.tsx`             | Create | Single-select dropdown; hides Plan option                                                                      |
| `apps/web-planner/src/components/group-by/GroupByPicker.spec.tsx`        | Create | Option list + selection tests                                                                                  |
| `apps/web-planner/src/components/coming-soon/ComingSoon.tsx`             | Create | Placeholder used by Grid/Schedule/Charts routes until their plans ship                                         |
| `apps/web-planner/src/app/plans/[id]/layout.tsx`                         | Modify | Add plan header row: ViewPicker + FilterBar + GroupByPicker                                                    |
| `apps/web-planner/src/app/plans/[id]/board/page.tsx`                     | Modify | Consume `useViewState`; apply filter + group to snapshot before render                                         |
| `apps/web-planner/src/app/plans/[id]/grid/page.tsx`                      | Create | `<ComingSoon flag="planner.grid.enabled" />`                                                                   |
| `apps/web-planner/src/app/plans/[id]/schedule/page.tsx`                  | Create | `<ComingSoon flag="planner.schedule.enabled" />`                                                               |
| `apps/web-planner/src/app/plans/[id]/charts/page.tsx`                    | Create | `<ComingSoon flag="planner.charts.enabled" />`                                                                 |
| `apps/api/src/modules/admin/seed/feature-flags.ts` (or equivalent)       | Modify | Register `planner.views.enabled`, `planner.grid.enabled`, `planner.schedule.enabled`, `planner.charts.enabled` |

---

## Task 1 — View state types and URL codec (TDD)

**Files:**

- Create: `apps/web-planner/src/lib/view-state.ts`
- Create: `apps/web-planner/src/lib/view-state.spec.ts`

- [ ] **Step 1: Write failing tests for URL parse/serialize round-trip.**

```ts
// apps/web-planner/src/lib/view-state.spec.ts
import { describe, expect, it } from 'vitest'
import {
  parseViewStateFromSearch,
  serializeViewStateToSearch,
  DEFAULT_VIEW_STATE,
} from './view-state'

describe('view-state URL codec', () => {
  it('round-trips an empty state to an empty query string', () => {
    const encoded = serializeViewStateToSearch(DEFAULT_VIEW_STATE)
    expect(encoded).toEqual('')
    expect(parseViewStateFromSearch(new URLSearchParams(''))).toEqual(DEFAULT_VIEW_STATE)
  })

  it('round-trips a full state', () => {
    const state = {
      view: 'grid' as const,
      groupBy: 'priority' as const,
      sort: { field: 'due', dir: 'asc' as const },
      filter: {
        due: 'today' as const,
        priority: ['urgent', 'important'],
        labels: ['l_1', 'l_2'],
        buckets: [],
        assignees: ['a_7'],
      },
      scale: undefined,
      trendRange: undefined,
    }
    const encoded = serializeViewStateToSearch(state)
    expect(encoded).toContain('group=priority')
    expect(encoded).toContain('sort=due:asc')
    expect(encoded).toContain('filter.due=today')
    expect(encoded).toContain('filter.priority=urgent,important')
    expect(parseViewStateFromSearch(new URLSearchParams(encoded))).toEqual(state)
  })

  it('rejects invalid values and falls back to defaults', () => {
    const parsed = parseViewStateFromSearch(new URLSearchParams('group=nonexistent&sort=bogus'))
    expect(parsed.groupBy).toEqual('bucket')
    expect(parsed.sort).toBeUndefined()
  })

  it('single-valued filter.due does not accept comma list', () => {
    const parsed = parseViewStateFromSearch(new URLSearchParams('filter.due=late,today'))
    expect(parsed.filter.due).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to confirm failure.**

```bash
bun run --filter @future/web-planner test:unit -- view-state
```

Expected: test module not found / exports missing.

- [ ] **Step 3: Implement the codec.**

```ts
// apps/web-planner/src/lib/view-state.ts
import { z } from 'zod'

export const VIEW_KEYS = ['board', 'grid', 'schedule', 'charts'] as const
export const GROUP_KEYS = ['bucket', 'progress', 'due', 'priority', 'assignee', 'label'] as const
export const PRIORITIES = ['urgent', 'important', 'medium', 'low'] as const
export const DUE_BUCKETS = [
  'late',
  'today',
  'tomorrow',
  'this-week',
  'next-week',
  'future',
  'none',
] as const
export const SORT_FIELDS = [
  'title',
  'bucket',
  'progress',
  'priority',
  'start',
  'due',
  'updated',
] as const

export type ViewKey = (typeof VIEW_KEYS)[number]
export type GroupKey = (typeof GROUP_KEYS)[number]
export type Priority = (typeof PRIORITIES)[number]
export type DueBucket = (typeof DUE_BUCKETS)[number]
export type SortField = (typeof SORT_FIELDS)[number]

export type ViewState = {
  view: ViewKey
  groupBy: GroupKey
  sort?: { field: SortField; dir: 'asc' | 'desc' }
  filter: {
    due?: DueBucket
    priority: Priority[]
    labels: string[]
    buckets: string[]
    assignees: string[]
  }
  scale?: 'week' | 'month'
  trendRange?: '7d' | '30d' | '90d'
}

export const DEFAULT_VIEW_STATE: ViewState = {
  view: 'board',
  groupBy: 'bucket',
  sort: undefined,
  filter: { due: undefined, priority: [], labels: [], buckets: [], assignees: [] },
  scale: undefined,
  trendRange: undefined,
}

const SORT_RE = /^([a-z]+):(asc|desc)$/

export function parseViewStateFromSearch(params: URLSearchParams): ViewState {
  const view = params.get('view')
  const group = params.get('group')
  const sortRaw = params.get('sort')
  const dueRaw = params.get('filter.due')
  const priorityRaw = params.get('filter.priority')
  const labelsRaw = params.get('filter.labels')
  const bucketsRaw = params.get('filter.buckets')
  const assigneesRaw = params.get('filter.assignees')
  const scaleRaw = params.get('scale')
  const trendRaw = params.get('trendRange')

  const sortMatch = sortRaw?.match(SORT_RE)
  const sortField =
    sortMatch && (SORT_FIELDS as readonly string[]).includes(sortMatch[1])
      ? (sortMatch[1] as SortField)
      : undefined

  const multi = <T extends string>(raw: string | null, allowed: readonly T[]): T[] =>
    raw
      ? raw
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
          .filter((s): s is T => (allowed as readonly string[]).includes(s))
      : []

  const ids = (raw: string | null): string[] =>
    raw
      ? raw
          .split(',')
          .map((s) => s.trim())
          .filter((s) => /^[a-zA-Z0-9_\-]+$/.test(s))
      : []

  return {
    view: (VIEW_KEYS as readonly string[]).includes(view ?? '') ? (view as ViewKey) : 'board',
    groupBy:
      (GROUP_KEYS as readonly string[]).includes(group ?? '') && group !== 'plan'
        ? (group as GroupKey)
        : 'bucket',
    sort: sortField ? { field: sortField, dir: sortMatch![2] as 'asc' | 'desc' } : undefined,
    filter: {
      due:
        dueRaw && (DUE_BUCKETS as readonly string[]).includes(dueRaw)
          ? (dueRaw as DueBucket)
          : undefined,
      priority: multi(priorityRaw, PRIORITIES),
      labels: ids(labelsRaw),
      buckets: ids(bucketsRaw),
      assignees: ids(assigneesRaw),
    },
    scale: scaleRaw === 'week' || scaleRaw === 'month' ? scaleRaw : undefined,
    trendRange:
      trendRaw === '7d' || trendRaw === '30d' || trendRaw === '90d' ? trendRaw : undefined,
  }
}

export function serializeViewStateToSearch(state: ViewState): string {
  const p = new URLSearchParams()
  if (state.view !== DEFAULT_VIEW_STATE.view) p.set('view', state.view)
  if (state.groupBy !== DEFAULT_VIEW_STATE.groupBy) p.set('group', state.groupBy)
  if (state.sort) p.set('sort', `${state.sort.field}:${state.sort.dir}`)
  if (state.filter.due) p.set('filter.due', state.filter.due)
  if (state.filter.priority.length > 0) p.set('filter.priority', state.filter.priority.join(','))
  if (state.filter.labels.length > 0) p.set('filter.labels', state.filter.labels.join(','))
  if (state.filter.buckets.length > 0) p.set('filter.buckets', state.filter.buckets.join(','))
  if (state.filter.assignees.length > 0) p.set('filter.assignees', state.filter.assignees.join(','))
  if (state.scale) p.set('scale', state.scale)
  if (state.trendRange) p.set('trendRange', state.trendRange)
  return p.toString()
}
```

- [ ] **Step 4: Run tests — expect pass.**

```bash
bun run --filter @future/web-planner test:unit -- view-state
```

- [ ] **Step 5: Commit.**

```bash
git add apps/web-planner/src/lib/view-state.ts apps/web-planner/src/lib/view-state.spec.ts
git commit -m "feat(web-planner): view state URL codec"
```

---

## Task 2 — `useViewState` React hook (URL + localStorage sync)

**Files:**

- Modify: `apps/web-planner/src/lib/view-state.ts` (append hook)
- Modify: `apps/web-planner/src/lib/view-state.spec.ts` (add hook tests)

- [ ] **Step 1: Write failing tests for the hook.** Use `renderHook` from `@testing-library/react`. Seed the URL via `next/navigation` mock.

```ts
// apps/web-planner/src/lib/view-state.spec.ts — append
import { renderHook, act } from '@testing-library/react'
import { useViewState } from './view-state'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams('group=priority'),
  usePathname: () => '/plans/abc/board',
}))

describe('useViewState', () => {
  it('reads initial state from URL', () => {
    const { result } = renderHook(() => useViewState({ planId: 'abc' }))
    expect(result.current.state.groupBy).toBe('priority')
  })

  it('patch merges filter additions without clearing others', () => {
    const { result } = renderHook(() => useViewState({ planId: 'abc' }))
    act(() => result.current.patch({ filter: { priority: ['urgent'] } }))
    expect(result.current.state.filter.priority).toEqual(['urgent'])
    expect(result.current.state.groupBy).toBe('priority')
  })

  it('falls back to localStorage when URL is empty', () => {
    localStorage.setItem(
      'planner:view:abc',
      JSON.stringify({ ...DEFAULT_VIEW_STATE, groupBy: 'due' }),
    )
    // new render with empty searchParams
    // ...
  })
})
```

- [ ] **Step 2: Implement the hook.**

```ts
// apps/web-planner/src/lib/view-state.ts — append
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

const LS_PREFIX = 'planner:view:'
const LS_DEBOUNCE_MS = 200

export function useViewState({ planId }: { planId: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const hydrate = useCallback((): ViewState => {
    const fromUrl = parseViewStateFromSearch(searchParams)
    const isUrlEmpty = searchParams.toString().length === 0
    if (!isUrlEmpty) return fromUrl
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(LS_PREFIX + planId)
        if (raw) return { ...DEFAULT_VIEW_STATE, ...JSON.parse(raw) }
      } catch {
        /* corrupt — ignore */
      }
    }
    return DEFAULT_VIEW_STATE
  }, [planId, searchParams])

  const [state, setState] = useState<ViewState>(hydrate)

  // one-time hydration from localStorage when URL was empty on mount
  useEffect(() => {
    if (searchParams.toString().length === 0 && state !== DEFAULT_VIEW_STATE) {
      const encoded = serializeViewStateToSearch(state)
      if (encoded.length > 0) router.replace(`${pathname}?${encoded}`, { scroll: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const lsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const commit = useCallback(
    (next: ViewState) => {
      setState(next)
      const encoded = serializeViewStateToSearch(next)
      router.replace(encoded.length > 0 ? `${pathname}?${encoded}` : pathname, { scroll: false })
      if (lsTimerRef.current) clearTimeout(lsTimerRef.current)
      lsTimerRef.current = setTimeout(() => {
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(LS_PREFIX + planId, JSON.stringify(next))
          } catch {
            /* quota */
          }
        }
      }, LS_DEBOUNCE_MS)
    },
    [pathname, planId, router],
  )

  const patch = useCallback(
    (partial: Partial<ViewState> & { filter?: Partial<ViewState['filter']> }) => {
      commit({
        ...state,
        ...partial,
        filter: { ...state.filter, ...(partial.filter ?? {}) },
      })
    },
    [commit, state],
  )

  const reset = useCallback(() => commit(DEFAULT_VIEW_STATE), [commit])

  return useMemo(() => ({ state, patch, reset, commit }), [state, patch, reset, commit])
}
```

- [ ] **Step 3: Run tests — expect pass.**
- [ ] **Step 4: Commit.**

```bash
git add apps/web-planner/src/lib/view-state.ts apps/web-planner/src/lib/view-state.spec.ts
git commit -m "feat(web-planner): useViewState hook with URL + localStorage sync"
```

---

## Task 3 — `task-filter` pure function (TDD)

**Files:**

- Create: `apps/web-planner/src/lib/task-filter.ts`
- Create: `apps/web-planner/src/lib/task-filter.spec.ts`

- [ ] **Step 1: Write exhaustive table-driven tests.** Cover each filter field in isolation and in combination. Due-bucket cases require a mocked `now` so dates are deterministic.

```ts
// apps/web-planner/src/lib/task-filter.spec.ts
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'
import { applyTaskFilter } from './task-filter'
import type { TaskFlat } from '@future/api-client/planner' // shared type shipped in Plan 02

const mkTask = (partial: Partial<TaskFlat>): TaskFlat => ({
  id: 't1',
  planId: 'p1',
  bucketId: 'b1',
  bucketName: 'B1',
  bucketOrderHint: 'a',
  title: 'T',
  progress: 'not-started',
  priority: 'medium',
  startDate: null,
  dueDate: null,
  assignees: [],
  labels: [],
  orderHint: 'a',
  commentCount: 0,
  checklistCount: { total: 0, completed: 0 },
  attachmentCount: 0,
  createdAt: '2026-04-01T00:00Z',
  updatedAt: '2026-04-01T00:00Z',
  ...partial,
})

describe('applyTaskFilter', () => {
  beforeAll(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-19T12:00:00Z'))
  })
  afterAll(() => {
    vi.useRealTimers()
  })

  const tasks: TaskFlat[] = [
    mkTask({ id: '1', dueDate: '2026-04-10T00:00Z', priority: 'urgent' }), // late + urgent
    mkTask({ id: '2', dueDate: '2026-04-19T00:00Z', priority: 'medium' }), // today
    mkTask({ id: '3', dueDate: '2026-04-20T00:00Z' }), // tomorrow
    mkTask({ id: '4', dueDate: '2026-04-22T00:00Z' }), // this week
    mkTask({ id: '5', dueDate: '2026-04-27T00:00Z' }), // next week
    mkTask({ id: '6', dueDate: '2026-06-01T00:00Z' }), // future
    mkTask({ id: '7', dueDate: null }), // none
  ]

  it.each([
    ['late', ['1']],
    ['today', ['2']],
    ['tomorrow', ['3']],
    ['this-week', ['2', '3', '4']],
    ['next-week', ['5']],
    ['future', ['6']],
    ['none', ['7']],
  ])('filters by due=%s', (due, ids) => {
    const out = applyTaskFilter(tasks, {
      due: due as any,
      priority: [],
      labels: [],
      buckets: [],
      assignees: [],
    })
    expect(out.map((t) => t.id)).toEqual(ids)
  })

  it('combines priority and due (AND semantics)', () => {
    const out = applyTaskFilter(tasks, {
      due: 'late',
      priority: ['urgent'],
      labels: [],
      buckets: [],
      assignees: [],
    })
    expect(out.map((t) => t.id)).toEqual(['1'])
  })

  it('label filter matches any label on the task', () => {
    const withLabels = [mkTask({ id: 'a', labels: [{ id: 'l1', name: 'A', color: '#000' }] })]
    expect(
      applyTaskFilter(withLabels, { priority: [], labels: ['l1'], buckets: [], assignees: [] }),
    ).toHaveLength(1)
    expect(
      applyTaskFilter(withLabels, { priority: [], labels: ['lX'], buckets: [], assignees: [] }),
    ).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run to confirm failure (module missing).**
- [ ] **Step 3: Implement.**

```ts
// apps/web-planner/src/lib/task-filter.ts
import type { TaskFlat } from '@future/api-client/planner'
import type { ViewState } from './view-state'

export type FilterInput = ViewState['filter']

export function applyTaskFilter(
  tasks: TaskFlat[],
  filter: FilterInput,
  now: Date = new Date(),
): TaskFlat[] {
  const hasPriority = filter.priority.length > 0
  const hasLabels = filter.labels.length > 0
  const hasBuckets = filter.buckets.length > 0
  const hasAssignees = filter.assignees.length > 0

  const dueMatches = buildDueMatcher(filter.due, now)

  return tasks.filter((t) => {
    if (dueMatches && !dueMatches(t.dueDate)) return false
    if (hasPriority && !filter.priority.includes(t.priority)) return false
    if (hasLabels && !t.labels.some((l) => filter.labels.includes(l.id))) return false
    if (hasBuckets && !filter.buckets.includes(t.bucketId)) return false
    if (hasAssignees && !t.assignees.some((a) => filter.assignees.includes(a.actorId))) return false
    return true
  })
}

function buildDueMatcher(
  due: FilterInput['due'],
  now: Date,
): ((iso: string | null) => boolean) | null {
  if (!due) return null
  const todayStart = startOfDay(now)
  const todayEnd = addDays(todayStart, 1)
  const tomorrowEnd = addDays(todayStart, 2)
  const thisWeekEnd = addDays(todayStart, 7 - ((now.getUTCDay() + 6) % 7)) // ISO week end (Sunday 00:00 next)
  const nextWeekEnd = addDays(thisWeekEnd, 7)

  return (iso) => {
    if (due === 'none') return iso === null
    if (iso === null) return false
    const d = new Date(iso)
    switch (due) {
      case 'late':
        return d.getTime() < todayStart.getTime()
      case 'today':
        return d >= todayStart && d < todayEnd
      case 'tomorrow':
        return d >= todayEnd && d < tomorrowEnd
      case 'this-week':
        return d >= todayStart && d < thisWeekEnd
      case 'next-week':
        return d >= thisWeekEnd && d < nextWeekEnd
      case 'future':
        return d >= nextWeekEnd
      default:
        return false
    }
  }
}

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000)
}
```

- [ ] **Step 4: Run — expect pass.**
- [ ] **Step 5: Commit.**

```bash
git add apps/web-planner/src/lib/task-filter.ts apps/web-planner/src/lib/task-filter.spec.ts
git commit -m "feat(web-planner): pure task-filter with due-bucket matcher"
```

---

## Task 4 — `task-group` pure function (TDD)

**Files:**

- Create: `apps/web-planner/src/lib/task-group.ts`
- Create: `apps/web-planner/src/lib/task-group.spec.ts`

- [ ] **Step 1: Write tests covering each group key + label-cardinality.** Per Decision 2-7 and Risk "Group-by-Labels cardinality," group-by-label means a task appears in every label group it owns (not just the first).

```ts
// apps/web-planner/src/lib/task-group.spec.ts
import { describe, expect, it } from 'vitest'
import { groupTasks } from './task-group'

describe('groupTasks', () => {
  it('group-by-bucket preserves bucketOrderHint order', () => {
    const groups = groupTasks(
      [
        mkTask({ id: '1', bucketId: 'b2', bucketName: 'B', bucketOrderHint: 'b' }),
        mkTask({ id: '2', bucketId: 'b1', bucketName: 'A', bucketOrderHint: 'a' }),
      ],
      'bucket',
    )
    expect(groups.map((g) => g.key)).toEqual(['b1', 'b2'])
  })

  it('group-by-label places a task in every label group it owns', () => {
    const groups = groupTasks(
      [
        mkTask({
          id: '1',
          labels: [
            { id: 'l1', name: 'A', color: '#000' },
            { id: 'l2', name: 'B', color: '#000' },
          ],
        }),
      ],
      'label',
    )
    expect(groups.flatMap((g) => g.tasks.map((t) => t.id))).toEqual(['1', '1'])
  })

  it('group-by-assignee: unassigned tasks get a synthetic "unassigned" group', () => {
    const groups = groupTasks([mkTask({ id: '1', assignees: [] })], 'assignee')
    expect(groups[0].key).toBe('__unassigned')
  })
})
```

- [ ] **Step 2: Run — confirm failure.**
- [ ] **Step 3: Implement.**

```ts
// apps/web-planner/src/lib/task-group.ts
import type { TaskFlat } from '@future/api-client/planner'
import type { GroupKey } from './view-state'

export type TaskGroup = { key: string; label: string; tasks: TaskFlat[] }

export function groupTasks(
  tasks: TaskFlat[],
  groupBy: GroupKey,
  now: Date = new Date(),
): TaskGroup[] {
  switch (groupBy) {
    case 'bucket':
      return groupByBucket(tasks)
    case 'progress':
      return groupByProgress(tasks)
    case 'due':
      return groupByDue(tasks, now)
    case 'priority':
      return groupByPriority(tasks)
    case 'assignee':
      return groupByAssignee(tasks)
    case 'label':
      return groupByLabel(tasks)
  }
}

function groupByBucket(tasks: TaskFlat[]): TaskGroup[] {
  const byKey = new Map<string, { name: string; hint: string; tasks: TaskFlat[] }>()
  for (const t of tasks) {
    const existing = byKey.get(t.bucketId)
    if (existing) existing.tasks.push(t)
    else byKey.set(t.bucketId, { name: t.bucketName, hint: t.bucketOrderHint, tasks: [t] })
  }
  return [...byKey.values()]
    .sort((a, b) => a.hint.localeCompare(b.hint))
    .map((v) => ({
      key: [...byKey.entries()].find(([, x]) => x === v)![0],
      label: v.name,
      tasks: v.tasks,
    }))
}

const PROGRESS_ORDER = ['not-started', 'in-progress', 'completed'] as const
function groupByProgress(tasks: TaskFlat[]): TaskGroup[] {
  return PROGRESS_ORDER.map((p) => ({
    key: p,
    label: PROGRESS_LABELS[p],
    tasks: tasks.filter((t) => t.progress === p),
  }))
}

const PROGRESS_LABELS: Record<TaskFlat['progress'], string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  completed: 'Completed',
}

// … similar patterns for due, priority, assignee, label (with cardinality rule)
function groupByLabel(tasks: TaskFlat[]): TaskGroup[] {
  const byKey = new Map<string, { name: string; tasks: TaskFlat[] }>()
  for (const t of tasks) {
    if (t.labels.length === 0) {
      const g =
        byKey.get('__nolabel') ??
        (byKey.set('__nolabel', { name: 'No label', tasks: [] }), byKey.get('__nolabel')!)
      g.tasks.push(t)
      continue
    }
    for (const l of t.labels) {
      const g = byKey.get(l.id) ?? (byKey.set(l.id, { name: l.name, tasks: [] }), byKey.get(l.id)!)
      g.tasks.push(t)
    }
  }
  return [...byKey.entries()].map(([key, v]) => ({ key, label: v.name, tasks: v.tasks }))
}
```

- [ ] **Step 4: Run — expect pass.**
- [ ] **Step 5: Commit.**

```bash
git commit -am "feat(web-planner): pure task-group with label cardinality"
```

---

## Task 5 — `task-sort` pure function (TDD)

**Files:**

- Create: `apps/web-planner/src/lib/task-sort.ts`
- Create: `apps/web-planner/src/lib/task-sort.spec.ts`

- [ ] **Step 1: Write tests.** Asc/desc per field; stable order on ties (break by `orderHint`).

```ts
// apps/web-planner/src/lib/task-sort.spec.ts
import { describe, expect, it } from 'vitest'
import { sortTasks } from './task-sort'

describe('sortTasks', () => {
  it.each([
    ['title', 'asc', ['a', 'b', 'c']],
    ['priority', 'asc', ['urgent', 'important', 'medium', 'low']],
    ['due', 'desc', ['2026-06-01', '2026-04-20', '2026-04-10', null]],
  ])('sorts by %s %s', (field, dir, expected) => {
    /* … */
  })

  it('nulls-last for date sorts regardless of dir', () => {
    /* … */
  })

  it('is stable: ties broken by orderHint', () => {
    /* … */
  })
})
```

- [ ] **Step 2: Run — fail.**
- [ ] **Step 3: Implement.** Priority uses a fixed order `urgent < important < medium < low`. Dates: nulls always last.
- [ ] **Step 4: Run — pass.**
- [ ] **Step 5: Commit.**

---

## Task 6 — `ViewPicker` component (TDD)

**Files:**

- Create: `apps/web-planner/src/components/view-picker/ViewPicker.tsx`
- Create: `apps/web-planner/src/components/view-picker/ViewPicker.spec.tsx`

- [ ] **Step 1: Write tests.**

```tsx
// apps/web-planner/src/components/view-picker/ViewPicker.spec.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ViewPicker } from './ViewPicker'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => '/plans/abc/board',
  useSearchParams: () => new URLSearchParams('group=priority'),
}))
const mockReplace = vi.fn()

describe('ViewPicker', () => {
  it('renders all four tabs and marks Board active', () => {
    render(
      <ViewPicker
        planId="abc"
        currentView="board"
        flags={{ views: true, grid: true, schedule: true, charts: true }}
      />,
    )
    expect(screen.getByRole('tab', { name: /board/i })).toHaveAttribute('aria-selected', 'true')
  })

  it('navigates with searchParams preserved', async () => {
    render(
      <ViewPicker
        planId="abc"
        currentView="board"
        flags={{ views: true, grid: true, schedule: true, charts: true }}
      />,
    )
    await userEvent.click(screen.getByRole('tab', { name: /grid/i }))
    expect(mockReplace).toHaveBeenCalledWith('/plans/abc/grid?group=priority', { scroll: false })
  })

  it('disables a view tab whose flag is false', () => {
    render(
      <ViewPicker
        planId="abc"
        currentView="board"
        flags={{ views: true, grid: false, schedule: true, charts: true }}
      />,
    )
    expect(screen.getByRole('tab', { name: /grid/i })).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run — fail.**
- [ ] **Step 3: Implement with `@future/ui` Tabs primitive.**

```tsx
// apps/web-planner/src/components/view-picker/ViewPicker.tsx
'use client'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger } from '@future/ui'
import { LayoutGrid, LayoutList, Calendar, PieChart } from 'lucide-react'
import type { ViewKey } from '@/lib/view-state'

export type ViewPickerFlags = { views: boolean; grid: boolean; schedule: boolean; charts: boolean }

const VIEWS: {
  key: ViewKey
  label: string
  icon: typeof LayoutGrid
  flag: keyof ViewPickerFlags
}[] = [
  { key: 'board', label: 'Board', icon: LayoutGrid, flag: 'views' },
  { key: 'grid', label: 'Grid', icon: LayoutList, flag: 'grid' },
  { key: 'schedule', label: 'Schedule', icon: Calendar, flag: 'schedule' },
  { key: 'charts', label: 'Charts', icon: PieChart, flag: 'charts' },
]

export function ViewPicker({
  planId,
  currentView,
  flags,
}: {
  planId: string
  currentView: ViewKey
  flags: ViewPickerFlags
}) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const qs = sp.toString()

  return (
    <Tabs
      value={currentView}
      onValueChange={(v) =>
        router.replace(`/plans/${planId}/${v}${qs ? '?' + qs : ''}`, { scroll: false })
      }
    >
      <TabsList>
        {VIEWS.map(({ key, label, icon: Icon, flag }) => (
          <TabsTrigger key={key} value={key} disabled={!flags[flag]}>
            <Icon className="size-4" aria-hidden /> {label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
```

- [ ] **Step 4: Run — pass.**
- [ ] **Step 5: Commit.**

---

## Task 7 — `FilterBar` + `FilterChip` + `FilterPopover` shells

**Files:**

- Create: `apps/web-planner/src/components/filter-bar/{FilterBar,FilterChip,FilterPopover}.tsx`
- Create: `apps/web-planner/src/components/filter-bar/FilterBar.spec.tsx`

- [ ] **Step 1: Write FilterBar tests.** Add/remove chip flow; chip shows correct summary.

```tsx
// FilterBar.spec.tsx
describe('FilterBar', () => {
  it('renders chips for each active filter field', () => {
    /* … */
  })
  it('"Add filter" menu lists only not-yet-active fields', () => {
    /* … */
  })
  it('clicking a chip opens its popover; Clear removes it from viewState', () => {
    /* … */
  })
})
```

- [ ] **Step 2: Run — fail.**
- [ ] **Step 3: Implement.** The three components are a composition:

```tsx
// FilterBar.tsx — composition only; per-filter editors live in filters/*
'use client'
import { useMemo } from 'react'
import { Plus } from 'lucide-react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from '@future/ui'
import { FilterChip } from './FilterChip'
import { useViewState } from '@/lib/view-state'
import type { PlanContext } from './types' // assignees/labels/buckets lookups

export function FilterBar({ planId, context }: { planId: string; context: PlanContext }) {
  const { state, patch } = useViewState({ planId })
  const active = useMemo(() => computeActiveFields(state.filter), [state.filter])
  const available = (['due', 'priority', 'labels', 'buckets', 'assignees'] as const).filter(
    (k) => !active.includes(k),
  )

  return (
    <div className="flex flex-wrap items-center gap-2">
      {active.map((field) => (
        <FilterChip key={field} planId={planId} field={field} context={context} />
      ))}
      {available.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <Plus className="size-4" /> Add filter
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {available.map((f) => (
              <DropdownMenuItem
                key={f}
                onSelect={() => patch({ filter: addFilterDefault(state.filter, f) })}
              >
                {FILTER_LABEL[f]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Add the five per-filter editors** (`filters/DueFilter.tsx` etc.), each a self-contained `{value, onChange}` component. Due uses `RadioGroup`; others use `Command` (search + multi-check).
- [ ] **Step 5: Run component tests — pass.**
- [ ] **Step 6: Commit.**

---

## Task 8 — `GroupByPicker` (hides Plan option)

**Files:**

- Create: `apps/web-planner/src/components/group-by/GroupByPicker.tsx`
- Create: `apps/web-planner/src/components/group-by/GroupByPicker.spec.tsx`

- [ ] **Step 1: Test that only 6 options render — no "Plan".**

```tsx
it('does not offer Plan as a group-by option', () => {
  render(<GroupByPicker planId="abc" />)
  await userEvent.click(screen.getByRole('combobox'))
  expect(screen.queryByRole('option', { name: /plan/i })).toBeNull()
  expect(screen.getAllByRole('option')).toHaveLength(6)
})
```

- [ ] **Step 2: Run — fail.**
- [ ] **Step 3: Implement.** `Select` from `@future/ui`; options drawn from `GROUP_KEYS` minus `plan`.
- [ ] **Step 4: Run — pass.**
- [ ] **Step 5: Commit.**

---

## Task 9 — `ComingSoon` placeholder

**Files:**

- Create: `apps/web-planner/src/components/coming-soon/ComingSoon.tsx`

- [ ] **Step 1:** Small component — `<Alert>` with view name and flag status. No tests needed (pure presentational).
- [ ] **Step 2:** Create the three `.../grid/page.tsx`, `.../schedule/page.tsx`, `.../charts/page.tsx` pages each rendering `<ComingSoon />`.
- [ ] **Step 3:** Commit.

---

## Task 10 — Modify `plans/[id]/layout.tsx` to host shared header

**Files:**

- Modify: `apps/web-planner/src/app/plans/[id]/layout.tsx`

- [ ] **Step 1: Write integration test** using `@testing-library/react` with a mocked `usePathname`. Assert ViewPicker, FilterBar, GroupByPicker are all in the DOM.
- [ ] **Step 2:** Implement:

```tsx
// layout.tsx
import { ViewPicker } from '@/components/view-picker/ViewPicker'
import { FilterBar } from '@/components/filter-bar/FilterBar'
import { GroupByPicker } from '@/components/group-by/GroupByPicker'
import { PlanTitle } from '@/components/plan-header/PlanTitle' // existing from #1
import { ReactNode } from 'react'

export default async function PlanLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const flags = await getPlannerFlags() // feature-flag facade, server-side
  const context = await getPlanContext(id)

  return (
    <>
      <header className="flex flex-col gap-3 border-b border-border px-6 py-4">
        <PlanTitle planId={id} />
        <div className="flex items-center justify-between gap-4">
          <ViewPicker planId={id} currentView={derivedFromPath} flags={flags} />
          <div className="flex items-center gap-3">
            <FilterBar planId={id} context={context} />
            <GroupByPicker planId={id} />
          </div>
        </div>
      </header>
      {children}
    </>
  )
}
```

- [ ] **Step 3:** Run — pass.
- [ ] **Step 4:** Commit.

---

## Task 11 — Wire Board to consume shared view state

**Files:**

- Modify: `apps/web-planner/src/app/plans/[id]/board/page.tsx`

- [ ] **Step 1: Write test** confirming the Board page:
  1. Renders only tasks matching the active filter.
  2. Uses the active group-by to determine column layout (group-by-bucket remains default).
  3. Applies active sort to tasks within each group.

- [ ] **Step 2: Modify Board `page.tsx`.** Pull `TaskFlat[]` equivalent from the existing `tasks.getBoard` snapshot (flatten `bucket.tasks` into a single array). Apply `applyTaskFilter` → `sortTasks` → `groupTasks` → render columns.

  Important: filter and group run against the already-fetched snapshot — no new network call, no new endpoint.

- [ ] **Step 3:** Run Board E2E via `bun run --filter @future/web-planner test:e2e -- board`. Adjust any broken assertions if the filter bar changed the DOM.

- [ ] **Step 4:** Commit.

```bash
git commit -am "feat(web-planner): board consumes shared view state (filter + group + sort)"
```

---

## Task 12 — Register feature flags

**Files:**

- Modify: wherever feature flags are registered (likely `apps/api/src/modules/admin/...` or `apps/api/src/seeds/seed.ts` — grep for an existing `planner.core.enabled` registration).

- [ ] **Step 1:** Add:
  - `planner.views.enabled` (default: true in dev, false in prod)
  - `planner.grid.enabled` (default: false everywhere)
  - `planner.schedule.enabled` (default: false everywhere)
  - `planner.charts.enabled` (default: false everywhere)
- [ ] **Step 2:** Add integration test asserting the flags can be read by the zone's server-side fetch.
- [ ] **Step 3:** Commit.

---

## Task 13 — `useViewRenderedTelemetry` observability hook

**Files:**

- Create: `apps/web-planner/src/lib/hooks/useViewRenderedTelemetry.ts`
- Create: `apps/web-planner/src/lib/hooks/useViewRenderedTelemetry.spec.ts`

Emits the `planner.view.rendered` event per spec §7. Used by every view page (Board in this plan; Grid/Schedule/Charts in their respective plans).

- [ ] **Step 1: Test.** Renders a mock consumer, changes props, asserts the hook emits exactly one event per distinct `(view, planId, taskCount, filterKeys, groupBy)` combination.

```ts
// useViewRenderedTelemetry.spec.ts
import { renderHook } from '@testing-library/react'
import { useViewRenderedTelemetry } from './useViewRenderedTelemetry'

describe('useViewRenderedTelemetry', () => {
  it('emits exactly one event on mount with the provided payload', () => {
    const emit = vi.fn()
    renderHook(() =>
      useViewRenderedTelemetry({
        emit,
        view: 'board',
        planId: 'p1',
        taskCount: 42,
        filterKeys: ['priority'],
        groupBy: 'bucket',
      }),
    )
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith(
      'planner.view.rendered',
      expect.objectContaining({
        zone: 'web-planner',
        view: 'board',
        planId: 'p1',
        taskCount: 42,
        groupBy: 'bucket',
        filterKeys: ['priority'],
      }),
    )
  })

  it('debounces: successive renders with identical payload emit once', () => {
    /* … */
  })

  it('re-emits when view, planId, taskCount, or groupBy change', () => {
    /* … */
  })
})
```

- [ ] **Step 2: Run — fail.**
- [ ] **Step 3: Implement.** Uses the zone's existing telemetry client (grep `trpc.analytics` or the shared `emitEvent` util — whichever is in use). Debounces via a `useEffect` dependency array.

```ts
// useViewRenderedTelemetry.ts
'use client'
import { useEffect } from 'react'
import { emit as emitEvent } from '@/lib/telemetry' // existing zone-level emitter

export type ViewRenderedEvent = {
  view: 'board' | 'grid' | 'schedule' | 'charts'
  planId: string
  taskCount: number
  filterKeys: string[]
  groupBy: string
}

export function useViewRenderedTelemetry(
  payload: ViewRenderedEvent,
  opts?: { emit?: (name: string, data: unknown) => void },
) {
  const emit = opts?.emit ?? ((name, data) => emitEvent(name, data))
  const { view, planId, taskCount, filterKeys, groupBy } = payload

  useEffect(() => {
    emit('planner.view.rendered', {
      zone: 'web-planner',
      view,
      planId,
      taskCount,
      filterKeys: [...filterKeys].sort(),
      groupBy,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, planId, taskCount, groupBy, filterKeys.join(',')])
}
```

- [ ] **Step 4:** Invoke the hook in the Board page (`board/page.tsx`) modified in Task 11.

- [ ] **Step 5: Run — pass.**
- [ ] **Step 6:** Commit.

```bash
git add apps/web-planner/src/lib/hooks/useViewRenderedTelemetry.* apps/web-planner/src/app/plans/[id]/board/page.tsx
git commit -m "feat(web-planner): planner.view.rendered telemetry hook + wire to Board"
```

---

## Task 14 — End-to-end Playwright (filter + group + view switch)

**Files:**

- Create: `apps/web-planner/e2e/view-state.e2e.ts`

- [ ] **Step 1:** Seed a plan with 20 tasks across 3 buckets, 2 labels, 2 assignees.
- [ ] **Step 2:** Steps:
  1. Open Board.
  2. Click "Add filter" → "Priority" → check Urgent. Assert filtered count matches seeded urgent count.
  3. Change group-by to "Assignee". Assert columns reflect group change.
  4. Click Grid tab → lands on Grid placeholder (Plan 01 ships Grid as ComingSoon).
  5. Return to Board. Reload the page. Assert filter and group-by are restored from URL.
  6. Clear filter. Reload. Assert localStorage restored the previous state.
- [ ] **Step 3:** Commit.

---

## Task 15 — Flip `planner.views.enabled` for SETA tenant

- [ ] **Step 1:** Document current off-state. Flip to on for internal tenant via admin tool.
- [ ] **Step 2:** Smoke-test the plan page with the flag on; confirm the new header renders alongside the existing Board without visual regressions.
- [ ] **Step 3:** Commit the flag-flip in seed data / migration if applicable.
- [ ] **Step 4:** Open PR.

---

## Acceptance

- All new `.spec.ts` / `.spec.tsx` files green. Coverage ≥70% on the new `lib/` files (they are pure — aim for 100%).
- Board view works identically to before with flag off.
- With flag on: filter chips, group-by, view-picker visible; Board respects them; Grid/Schedule/Charts routes show ComingSoon.
- URL deep-linking works (`/plans/abc/board?group=priority&filter.due=today` reproduces state after hard-refresh).
- LocalStorage round-trips view state when URL is clean.
- No a11y regressions: ViewPicker tabs are keyboard-navigable; FilterBar chips have accessible names.

## Risks for this plan

| Risk                                                                                        | Mitigation                                                                                                     |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Board layout shifts because header is now a flex row of three controls                      | Add a perf/visual regression test comparing to #1's Board screenshot; tune spacing with DESIGN.md tokens only. |
| `useViewState` causing double-render on mount (localStorage hydration triggers URL replace) | The one-time `useEffect([])` guards the hydration; test for no infinite loop.                                  |
| Filter bar overflowing on narrow viewports                                                  | Chips wrap with `flex-wrap`; Add Filter stays visible. Test at 1024 px viewport.                               |
| Label-cardinality group-by surprising users (a task appearing in multiple columns)          | Decision locked — same as MS. Document in the inline tooltip on the group-by picker.                           |
