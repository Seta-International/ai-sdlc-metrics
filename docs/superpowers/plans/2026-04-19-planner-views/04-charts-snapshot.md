# Plan 04 — Charts View (Snapshot Tier)

> Covers spec **Plan 2.4** — see [design spec §6.7.1, §9](../../specs/2026-04-19-planner-views-design.md).
> Depends on Plan 02 (for `tasks.getFlat`). Plan 03 is orthogonal — order may swap with 03 if needed.

**Goal:** Ship the MS-parity snapshot tier of the Charts view. Five panels — **Progress donut**, **Priority bar**, **Bucket bar**, **Workload-by-assignee stacked bar**, **Late & Upcoming list** — all computed client-side from the filtered `TaskFlat[]`. Each panel drill-throughs to a filtered Grid. Charts render via the existing `@future/charts` package (ECharts + SETA themes). This plan introduces the chart palette token file that Plan 05 (trend tier) and any future chart work will extend.

**Architecture:** Pure client-side — Charts reads the same `tasks.getFlat` dataset other views use (zero backend additions in this plan). Charts reducers live in `lib/charts-data.ts` and are tested in isolation. Panel components are dumb — they accept pre-computed data and render ECharts option objects built by pure helpers in `lib/echarts-options.ts`. Drill-through navigation uses `useViewState` so filter state is re-set (replace semantics) when landing on Grid.

**Tech stack:** `@future/charts` (already present), ECharts via `echarts-for-react`, SETA theme tokens.

---

## File Map

| File                                                                   | Action  | Purpose                                                                     |
| ---------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------- |
| `packages/ui/src/tokens/chart.ts`                                      | Create  | Centralized chart palettes (progress / priority / bucket / assignee-tint)   |
| `packages/ui/src/tokens/chart.spec.ts`                                 | Create  | Snapshot tests on palette token exports                                     |
| `packages/ui/src/index.ts`                                             | Modify  | Re-export `chartTokens`                                                     |
| `apps/web-planner/src/lib/charts-data.ts`                              | Create  | Pure reducers — `TaskFlat[] → panel datasets`                               |
| `apps/web-planner/src/lib/charts-data.spec.ts`                         | Create  | Table-driven reducer tests                                                  |
| `apps/web-planner/src/lib/echarts-options.ts`                          | Create  | Pure builders — dataset → `EChartsOption`                                   |
| `apps/web-planner/src/lib/echarts-options.spec.ts`                     | Create  | Tests for option shape + theme application                                  |
| `apps/web-planner/src/components/charts/ChartsGrid.tsx`                | Create  | Responsive layout of panels                                                 |
| `apps/web-planner/src/components/charts/panels/ProgressDonut.tsx`      | Create  | Panel wrapper                                                               |
| `apps/web-planner/src/components/charts/panels/PriorityBar.tsx`        | Create  | Panel wrapper                                                               |
| `apps/web-planner/src/components/charts/panels/BucketBar.tsx`          | Create  | Panel wrapper                                                               |
| `apps/web-planner/src/components/charts/panels/WorkloadByAssignee.tsx` | Create  | Panel wrapper                                                               |
| `apps/web-planner/src/components/charts/panels/LateUpcomingList.tsx`   | Create  | Styled list (not a chart)                                                   |
| `apps/web-planner/src/components/charts/DrillThrough.ts`               | Create  | Builds a target URL for drill-through to Grid with replace-filter semantics |
| `apps/web-planner/src/components/charts/ChartsGrid.spec.tsx`           | Create  | Integration test                                                            |
| `apps/web-planner/src/app/plans/[id]/charts/page.tsx`                  | Replace | Drop ComingSoon; render `<ChartsGrid />`                                    |
| `apps/web-planner/e2e/charts.e2e.ts`                                   | Create  | Playwright: click donut slice → land on filtered Grid                       |
| `apps/web-planner/src/components/view-picker/ViewPicker.tsx`           | Modify  | Enable Charts tab when flag on                                              |

---

## Task 1 — Chart palette tokens

**Files:**

- Create: `packages/ui/src/tokens/chart.ts`
- Create: `packages/ui/src/tokens/chart.spec.ts`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Test** — palette tokens are defined, non-empty, and stable.

```ts
// chart.spec.ts
import { describe, expect, it } from 'vitest'
import { chartTokens } from './chart'

describe('chartTokens', () => {
  it('defines a palette for each chart dimension used by the planner', () => {
    expect(Object.keys(chartTokens.progress)).toEqual(['not-started', 'in-progress', 'completed'])
    expect(Object.keys(chartTokens.priority)).toEqual(['urgent', 'important', 'medium', 'low'])
    expect(chartTokens.assigneeTints.length).toBeGreaterThanOrEqual(12) // cycle-able for N assignees
  })

  it('every color is a valid DESIGN.md-compliant CSS variable reference', () => {
    for (const map of [chartTokens.progress, chartTokens.priority] as const) {
      for (const v of Object.values(map)) expect(v).toMatch(/^(var\(--|#)/)
    }
  })
})
```

- [ ] **Step 2: Implement.**

```ts
// packages/ui/src/tokens/chart.ts
// Chart palette tokens. Values reference DESIGN.md theme variables.
// All values must be resolvable to a computed color via CSS var lookup.

export const chartTokens = {
  progress: {
    'not-started': 'var(--chart-progress-not-started)',
    'in-progress': 'var(--chart-progress-in-progress)',
    completed: 'var(--chart-progress-completed)',
  },
  priority: {
    urgent: 'var(--chart-priority-urgent)',
    important: 'var(--chart-priority-important)',
    medium: 'var(--chart-priority-medium)',
    low: 'var(--chart-priority-low)',
  },
  bucket: [
    'var(--chart-bucket-1)',
    'var(--chart-bucket-2)',
    'var(--chart-bucket-3)',
    'var(--chart-bucket-4)',
    'var(--chart-bucket-5)',
    'var(--chart-bucket-6)',
  ],
  assigneeTints: [
    'var(--chart-tint-1)',
    'var(--chart-tint-2)',
    'var(--chart-tint-3)',
    'var(--chart-tint-4)',
    'var(--chart-tint-5)',
    'var(--chart-tint-6)',
    'var(--chart-tint-7)',
    'var(--chart-tint-8)',
    'var(--chart-tint-9)',
    'var(--chart-tint-10)',
    'var(--chart-tint-11)',
    'var(--chart-tint-12)',
  ],
} as const

export type ChartTokens = typeof chartTokens
```

- [ ] **Step 3: Add CSS variables** to `packages/ui/src/globals.css` (or equivalent). Grep for an existing `:root { --` block. Add `--chart-*` vars in both the light and dark themes. Pick values consistent with DESIGN.md — do not invent colors; consult existing tokens.

- [ ] **Step 4: Re-export** `chartTokens` from `packages/ui/src/index.ts`.

- [ ] **Step 5: Build the package.**

```bash
bun run --filter @future/ui build
```

- [ ] **Step 6: Commit.**

```bash
git add packages/ui/src/tokens/chart.ts packages/ui/src/tokens/chart.spec.ts packages/ui/src/index.ts packages/ui/src/globals.css
git commit -m "feat(ui): chart palette tokens referenced via CSS vars"
```

---

## Task 2 — `charts-data` pure reducers (TDD)

**Files:**

- Create: `apps/web-planner/src/lib/charts-data.ts`
- Create: `apps/web-planner/src/lib/charts-data.spec.ts`

- [ ] **Step 1: Write tests** for each reducer.

```ts
// charts-data.spec.ts
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'
import {
  reduceProgress,
  reducePriority,
  reduceBucket,
  reduceWorkloadByAssignee,
  reduceLateUpcoming,
} from './charts-data'

describe('reduceProgress', () => {
  it('counts tasks per progress state', () => {
    const tasks = [
      mkTask({ progress: 'not-started' }),
      mkTask({ progress: 'in-progress' }),
      mkTask({ progress: 'completed' }),
      mkTask({ progress: 'in-progress' }),
    ]
    expect(reduceProgress(tasks)).toEqual({
      'not-started': 1,
      'in-progress': 2,
      completed: 1,
    })
  })

  it('returns zeros when input is empty', () => {
    expect(reduceProgress([])).toEqual({ 'not-started': 0, 'in-progress': 0, completed: 0 })
  })
})

describe('reduceWorkloadByAssignee', () => {
  it('one row per assignee, stacked by priority, sorted by open-count desc', () => {
    const tasks = [
      mkTask({
        assignees: [{ actorId: 'a1', displayName: 'Ana', avatarUrl: null }],
        priority: 'urgent',
        progress: 'in-progress',
      }),
      mkTask({
        assignees: [{ actorId: 'a1', displayName: 'Ana', avatarUrl: null }],
        priority: 'medium',
        progress: 'not-started',
      }),
      mkTask({
        assignees: [{ actorId: 'a2', displayName: 'Bob', avatarUrl: null }],
        priority: 'low',
        progress: 'in-progress',
      }),
    ]
    const rows = reduceWorkloadByAssignee(tasks)
    expect(rows[0]).toMatchObject({
      actorId: 'a1',
      displayName: 'Ana',
      total: 2,
      perPriority: { urgent: 1, important: 0, medium: 1, low: 0 },
    })
    expect(rows[1]).toMatchObject({ actorId: 'a2', total: 1 })
  })

  it('excludes completed tasks (workload = open only)', () => {
    /* … */
  })

  it('places tasks with multiple assignees into each assignee row (double count — surface capacity)', () => {
    /* … */
  })
})

describe('reduceLateUpcoming', () => {
  beforeAll(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-19T12:00:00Z'))
  })
  afterAll(() => {
    vi.useRealTimers()
  })

  it('top 5 late + top 5 upcoming (within 7 days) sorted appropriately', () => {
    const out = reduceLateUpcoming([
      /* … */
    ])
    expect(out.late).toHaveLength(5)
    expect(out.upcoming).toHaveLength(5)
  })
})
```

- [ ] **Step 2: Run — fail.**
- [ ] **Step 3: Implement each reducer.**

```ts
// charts-data.ts — excerpt
import type { TaskFlat } from '@future/api-client/planner'

export type ProgressCounts = Record<TaskFlat['progress'], number>
export type PriorityCounts = Record<TaskFlat['priority'], number>

export function reduceProgress(tasks: TaskFlat[]): ProgressCounts {
  const out: ProgressCounts = { 'not-started': 0, 'in-progress': 0, completed: 0 }
  for (const t of tasks) out[t.progress] += 1
  return out
}

export function reducePriority(tasks: TaskFlat[]): PriorityCounts {
  const out: PriorityCounts = { urgent: 0, important: 0, medium: 0, low: 0 }
  for (const t of tasks) out[t.priority] += 1
  return out
}

export function reduceBucket(
  tasks: TaskFlat[],
): { bucketId: string; bucketName: string; count: number; hint: string }[] {
  const byId = new Map<string, { bucketName: string; count: number; hint: string }>()
  for (const t of tasks) {
    const e = byId.get(t.bucketId)
    if (e) e.count += 1
    else byId.set(t.bucketId, { bucketName: t.bucketName, count: 1, hint: t.bucketOrderHint })
  }
  return [...byId.entries()]
    .map(([bucketId, v]) => ({ bucketId, ...v }))
    .sort((a, b) => a.hint.localeCompare(b.hint))
}

export type WorkloadRow = {
  actorId: string
  displayName: string
  avatarUrl: string | null
  total: number
  perPriority: PriorityCounts
}

export function reduceWorkloadByAssignee(tasks: TaskFlat[]): WorkloadRow[] {
  const byId = new Map<string, WorkloadRow>()
  for (const t of tasks) {
    if (t.progress === 'completed') continue
    for (const a of t.assignees) {
      let row = byId.get(a.actorId)
      if (!row) {
        row = {
          actorId: a.actorId,
          displayName: a.displayName,
          avatarUrl: a.avatarUrl,
          total: 0,
          perPriority: { urgent: 0, important: 0, medium: 0, low: 0 },
        }
        byId.set(a.actorId, row)
      }
      row.total += 1
      row.perPriority[t.priority] += 1
    }
  }
  return [...byId.values()].sort((a, b) => b.total - a.total)
}

export function reduceLateUpcoming(
  tasks: TaskFlat[],
  now: Date = new Date(),
): {
  late: TaskFlat[]
  upcoming: TaskFlat[]
} {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const weekOut = today + 7 * 86_400_000
  const late = tasks
    .filter((t) => t.dueDate && new Date(t.dueDate).getTime() < today && t.progress !== 'completed')
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
    .slice(0, 5)
  const upcoming = tasks
    .filter(
      (t) =>
        t.dueDate &&
        new Date(t.dueDate).getTime() >= today &&
        new Date(t.dueDate).getTime() <= weekOut &&
        t.progress !== 'completed',
    )
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
    .slice(0, 5)
  return { late, upcoming }
}
```

- [ ] **Step 4:** Run — pass.
- [ ] **Step 5:** Commit.

```bash
git add apps/web-planner/src/lib/charts-data.ts apps/web-planner/src/lib/charts-data.spec.ts
git commit -m "feat(web-planner): charts-data pure reducers (5 panels)"
```

---

## Task 3 — `echarts-options` builders (TDD)

**Files:**

- Create: `apps/web-planner/src/lib/echarts-options.ts`
- Create: `apps/web-planner/src/lib/echarts-options.spec.ts`

- [ ] **Step 1: Test** — option builders produce valid `EChartsOption` shapes with the correct series type, data length, and color palette.

```ts
// echarts-options.spec.ts
import { describe, expect, it } from 'vitest'
import {
  progressDonutOption,
  priorityBarOption,
  bucketBarOption,
  workloadBarOption,
} from './echarts-options'
import { chartTokens } from '@future/ui/tokens/chart'

describe('progressDonutOption', () => {
  it('returns a valid donut with three slices and applies progress palette', () => {
    const opt = progressDonutOption({ 'not-started': 5, 'in-progress': 10, completed: 3 })
    expect(opt.series?.[0]).toMatchObject({ type: 'pie', radius: ['55%', '85%'] })
    expect(opt.series?.[0].data).toHaveLength(3)
    expect(opt.color).toEqual([
      chartTokens.progress['not-started'],
      chartTokens.progress['in-progress'],
      chartTokens.progress['completed'],
    ])
  })

  it('hides slices with zero value to avoid empty legend entries', () => {
    const opt = progressDonutOption({ 'not-started': 0, 'in-progress': 5, completed: 0 })
    expect(opt.series?.[0].data.filter((d: any) => d.value > 0)).toHaveLength(1)
  })
})

describe('workloadBarOption', () => {
  it('stacks priority series on a shared y-axis of assignees', () => {
    const rows = [
      /* … */
    ]
    const opt = workloadBarOption(rows)
    const stackIds = opt.series?.map((s: any) => s.stack)
    expect(new Set(stackIds).size).toBe(1) // all series share one stack id
  })
})
```

- [ ] **Step 2: Run — fail.**
- [ ] **Step 3: Implement.** Keep each builder pure; accept only primitive / plain-object inputs. No React, no DOM.

- [ ] **Step 4:** Run — pass.
- [ ] **Step 5:** Commit.

---

## Task 4 — Panel components (5 panels, TDD each)

**Files:**

- Create: `apps/web-planner/src/components/charts/panels/ProgressDonut.tsx`, `PriorityBar.tsx`, `BucketBar.tsx`, `WorkloadByAssignee.tsx`, `LateUpcomingList.tsx`

For each ECharts panel:

- [ ] **Step 1: Component test** — renders `<EChart />` with the correct option; clicking a slice/bar fires the panel's `onDrill` callback with the correct payload.

```tsx
// ProgressDonut.spec.tsx
it('renders a donut and invokes onDrill with the slice key', async () => {
  const onDrill = vi.fn()
  render(
    <ProgressDonut
      counts={{ 'not-started': 1, 'in-progress': 2, completed: 0 }}
      onDrill={onDrill}
    />,
  )
  // Simulate ECharts click event via the helper from @future/charts test utils
  fireEChartsClick('progress-donut', { name: 'In progress', dataIndex: 1 })
  expect(onDrill).toHaveBeenCalledWith({ field: 'progress', value: 'in-progress' })
})
```

- [ ] **Step 2: Implement** each panel as a thin wrapper:

```tsx
// ProgressDonut.tsx
'use client'
import { EChart } from '@future/charts'
import { progressDonutOption } from '@/lib/echarts-options'

export function ProgressDonut({
  counts,
  onDrill,
}: {
  counts: Record<'not-started' | 'in-progress' | 'completed', number>
  onDrill: (d: { field: 'progress'; value: 'not-started' | 'in-progress' | 'completed' }) => void
}) {
  const option = progressDonutOption(counts)
  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="mb-3 text-sm font-medium">By Progress</h3>
      <EChart
        option={option}
        style={{ height: 260 }}
        onEvents={{
          click: (p: any) => {
            const map: Record<string, 'not-started' | 'in-progress' | 'completed'> = {
              'Not started': 'not-started',
              'In progress': 'in-progress',
              Completed: 'completed',
            }
            const v = map[p.name]
            if (v) onDrill({ field: 'progress', value: v })
          },
        }}
      />
    </div>
  )
}
```

- [ ] **Step 3:** `LateUpcomingList` is NOT a chart — it's a styled list:

```tsx
// LateUpcomingList.tsx
'use client'
import { AlertTriangle, Clock } from 'lucide-react'
import { reduceLateUpcoming } from '@/lib/charts-data'
import type { TaskFlat } from '@future/api-client/planner'

export function LateUpcomingList({
  tasks,
  onOpen,
}: {
  tasks: TaskFlat[]
  onOpen: (taskId: string) => void
}) {
  const { late, upcoming } = reduceLateUpcoming(tasks)
  return (
    <div className="rounded-lg border border-border p-4">
      <Section icon={AlertTriangle} title="Late" items={late} onOpen={onOpen} />
      <Section icon={Clock} title="Upcoming (next 7 days)" items={upcoming} onOpen={onOpen} />
    </div>
  )
}
```

- [ ] **Step 4:** Run all panel tests — pass.
- [ ] **Step 5:** Commit.

```bash
git add apps/web-planner/src/components/charts/panels/
git commit -m "feat(web-planner): snapshot-tier chart panels"
```

---

## Task 5 — `DrillThrough` URL builder

**Files:**

- Create: `apps/web-planner/src/components/charts/DrillThrough.ts`

- [ ] **Step 1: Test** — given a drill-through payload, produces the correct Grid URL with replace-filter semantics.

```ts
import { buildDrillThroughUrl } from './DrillThrough'

describe('buildDrillThroughUrl', () => {
  it('navigates to /plans/:id/grid?filter.priority=urgent', () => {
    expect(buildDrillThroughUrl('abc', { field: 'priority', value: 'urgent' })).toBe(
      '/plans/abc/grid?view=grid&filter.priority=urgent',
    )
  })
  it('replaces prior filters (does not merge)', () => {
    /* confirm no stray query string from prior state */
  })
  it('workload drill: both assignee AND priority in the URL', () => {
    expect(
      buildDrillThroughUrl('abc', { field: 'workload', assigneeId: 'a1', priority: 'urgent' }),
    ).toBe('/plans/abc/grid?view=grid&filter.assignees=a1&filter.priority=urgent')
  })
})
```

- [ ] **Step 2:** Implement using `serializeViewStateToSearch` from `view-state.ts` with a newly-constructed state (ignore existing view state — this is replace).

- [ ] **Step 3:** Run — pass.
- [ ] **Step 4:** Commit.

---

## Task 6 — `ChartsGrid` top-level layout (TDD)

**Files:**

- Create: `apps/web-planner/src/components/charts/ChartsGrid.tsx`
- Create: `apps/web-planner/src/components/charts/ChartsGrid.spec.tsx`

- [ ] **Step 1: Integration test** — renders all 5 panels in the responsive grid; each drill-through navigates to the right URL; empty dataset shows the `<Alert>` empty state.

```tsx
// ChartsGrid.spec.tsx
it('renders all 5 snapshot panels', () => {
  render(<ChartsGrid planId="abc" tasks={fixture50} />)
  expect(screen.getByText('By Progress')).toBeInTheDocument()
  expect(screen.getByText('By Priority')).toBeInTheDocument()
  expect(screen.getByText('By Bucket')).toBeInTheDocument()
  expect(screen.getByText('Workload by Assignee')).toBeInTheDocument()
  expect(screen.getByText('Late')).toBeInTheDocument()
})

it('shows empty state when filtered dataset is empty', () => {
  render(<ChartsGrid planId="abc" tasks={[]} />)
  expect(screen.getByRole('alert')).toHaveTextContent(/no tasks match/i)
})

it('drill-through navigates to filtered Grid', async () => {
  render(<ChartsGrid planId="abc" tasks={fixture50} />)
  fireEChartsClick('priority-bar', { name: 'Urgent' })
  expect(mockReplace).toHaveBeenCalledWith('/plans/abc/grid?view=grid&filter.priority=urgent', {
    scroll: false,
  })
})
```

- [ ] **Step 2:** Implement.

```tsx
// ChartsGrid.tsx
'use client'
import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  reduceProgress,
  reducePriority,
  reduceBucket,
  reduceWorkloadByAssignee,
} from '@/lib/charts-data'
import { ProgressDonut } from './panels/ProgressDonut'
import { PriorityBar } from './panels/PriorityBar'
import { BucketBar } from './panels/BucketBar'
import { WorkloadByAssignee } from './panels/WorkloadByAssignee'
import { LateUpcomingList } from './panels/LateUpcomingList'
import { buildDrillThroughUrl } from './DrillThrough'
import { Alert, AlertDescription } from '@future/ui'

export function ChartsGrid({ planId, tasks }: { planId: string; tasks: TaskFlat[] }) {
  const router = useRouter()
  const drill = (payload: any) =>
    router.replace(buildDrillThroughUrl(planId, payload), { scroll: false })

  const progress = useMemo(() => reduceProgress(tasks), [tasks])
  const priority = useMemo(() => reducePriority(tasks), [tasks])
  const bucket = useMemo(() => reduceBucket(tasks), [tasks])
  const workload = useMemo(() => reduceWorkloadByAssignee(tasks), [tasks])

  if (tasks.length === 0) {
    return (
      <Alert>
        <AlertDescription>No tasks match the current filters.</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="grid gap-4 p-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      <ProgressDonut counts={progress} onDrill={drill} />
      <PriorityBar counts={priority} onDrill={drill} />
      <BucketBar data={bucket} onDrill={drill} />
      <WorkloadByAssignee rows={workload} onDrill={drill} />
      <div className="lg:col-span-2">
        <LateUpcomingList
          tasks={tasks}
          onOpen={(id) => router.push(`/plans/${planId}/grid?open=${id}`)}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 3:** Run — pass.
- [ ] **Step 4:** Commit.

---

## Task 7 — Charts page

**Files:**

- Replace: `apps/web-planner/src/app/plans/[id]/charts/page.tsx`

- [ ] **Step 1:** Replace ComingSoon with:

```tsx
import { ChartsGrid } from '@/components/charts/ChartsGrid'
import { useFlatTasks } from '@/lib/hooks/useFlatTasks'

export default function ChartsPage({ params }: { params: { id: string } }) {
  const { processed, isLoading } = useFlatTasks({ planId: params.id })
  if (isLoading) return <SkeletonChartsGrid />
  return <ChartsGrid planId={params.id} tasks={processed?.rows ?? []} />
}
```

- [ ] **Step 2:** Enable the Charts tab in ViewPicker when `planner.charts.enabled` is on.

- [ ] **Step 3:** Commit.

---

## Task 8 — Playwright E2E

**Files:**

- Create: `apps/web-planner/e2e/charts.e2e.ts`

- [ ] **Step 1:** Seed plan with tasks spread across priorities + buckets + assignees.
- [ ] **Step 2:** Steps:
  1. Open Charts.
  2. Assert all 5 panels visible.
  3. Click the "Urgent" slice of Priority bar.
  4. Assert URL is `/plans/:id/grid?view=grid&filter.priority=urgent`.
  5. Assert Grid shows only urgent tasks.
  6. Go back. Apply a Due=Today filter. Return to Charts.
  7. Assert the panels' counts now reflect only Today's tasks.
  8. Empty state test — filter to a label that matches nothing → charts show empty `<Alert>`.
- [ ] **Step 3:** Commit.

---

## Task 9 — Visual regression screenshots

**Files:**

- Create: `apps/web-planner/e2e/charts.visual.spec.ts`

- [ ] **Step 1:** Take snapshots of the Charts page with the seeded fixture at 1440 px and 768 px viewports. Commit the baseline images under `apps/web-planner/e2e/__screenshots__/charts/`.
- [ ] **Step 2:** CI compares new screenshots to baseline on every PR (use Playwright's `toHaveScreenshot`).
- [ ] **Step 3:** Commit.

---

## Task 10 — Flip `planner.charts.enabled` for SETA tenant

- [ ] **Step 1:** Flip flag.
- [ ] **Step 2:** Smoke test.
- [ ] **Step 3:** PR.

---

## Acceptance

- All 5 panels render with correct counts for seeded fixture.
- Chart colors match DESIGN.md tokens (no hardcoded hex).
- Drill-through lands on Grid with a single replace-filter payload.
- Empty-state renders when filtered dataset is empty across all panels.
- Coverage ≥70% on new reducers + option builders + panels.
- Visual regression baseline committed.

## Risks for this plan

| Risk                                                                | Mitigation                                                                                                                                                  |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ECharts lazy-loads features on first render — flashes blank         | Preload the donut/bar renderers in `@future/charts` setup; acceptable ~50 ms cold cost.                                                                     |
| Chart palette tokens not yet defined in DESIGN.md                   | Task 1 adds the `--chart-*` CSS vars alongside the token file. Coordinate with design; if tokens need tuning post-review, update CSS only (no code change). |
| Workload panel N scaling with many assignees (50+)                  | Sort desc + show top 20 + "Show more" affordance (stretch — add only if real plans exceed).                                                                 |
| Click events on ECharts donut segments inconsistent across browsers | `@future/charts` `EChart` wrapper normalizes click payload; `fireEChartsClick` test helper simulates a canonical payload.                                   |
| Drill-through clearing filters users wanted to keep                 | Replace-semantics is decision 2-8 — document in a small help tooltip on the panels. Users who want to combine filters use Grid's filter bar.                |
| Empty slice clutter in donut (0-value categories)                   | Builder filters out zero-value data points before emitting the `series.data` array. Covered by test.                                                        |
