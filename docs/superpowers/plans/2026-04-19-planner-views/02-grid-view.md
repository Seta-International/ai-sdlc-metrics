# Plan 02 — Grid View + Inline Edit + Bulk Operations

> Covers spec **Plan 2.2** — see [design spec §5.1, §6.5, §9](../../specs/2026-04-19-planner-views-design.md).
> Depends on Plan 01 being merged.

**Goal:** Ship the Grid view — a dense, sortable, virtualized table of tasks with inline-editable cells for the five quick-field mutations, multi-select, and a bulk operations toolbar with progress UI. Backend adds one new read (`tasks.getFlat`). All writes reuse the field-mutation handlers shipped in Sub-project #1.

**Architecture:** `tasks.getFlat` returns the same row shape every downstream view consumes (Grid, Schedule, Charts). On the frontend, `@tanstack/react-table` drives column model + sorting, `@tanstack/react-virtual` drives row virtualization. Inline-edit cells reuse the same editors used in the task detail panel (DRY). Bulk operations loop existing single-task mutations with progress telemetry — stop on first error, allow retry-failed.

**Tech stack:** `@tanstack/react-table`, `@tanstack/react-virtual`, existing React Query + tRPC client, existing detail-panel editor components from #1.

---

## File Map

| File                                                                                                                                                     | Action  | Purpose                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------ |
| `apps/api/src/modules/planner/application/queries/tasks/get-flat.query.ts`                                                                               | Create  | Query DTO                                                                      |
| `apps/api/src/modules/planner/application/queries/tasks/get-flat.handler.ts`                                                                             | Create  | Query handler — returns `TaskFlat[]`                                           |
| `apps/api/src/modules/planner/application/queries/tasks/get-flat.handler.integration.spec.ts`                                                            | Create  | Integration test against real DB                                               |
| `apps/api/src/modules/planner/interface/trpc/task.router.ts`                                                                                             | Modify  | Add `getFlat` procedure                                                        |
| `packages/api-client/src/planner/task-flat.ts`                                                                                                           | Create  | Shared `TaskFlat` type (imported by `web-planner` and by the helper libs)      |
| `packages/api-client/src/planner/index.ts`                                                                                                               | Modify  | Export `TaskFlat`                                                              |
| `apps/web-planner/package.json`                                                                                                                          | Modify  | `bun add -F @future/web-planner @tanstack/react-table @tanstack/react-virtual` |
| `apps/web-planner/src/lib/hooks/useFlatTasks.ts`                                                                                                         | Create  | React Query wrapper for `tasks.getFlat`                                        |
| `apps/web-planner/src/components/grid/TaskGrid.tsx`                                                                                                      | Create  | Table shell                                                                    |
| `apps/web-planner/src/components/grid/columns.tsx`                                                                                                       | Create  | Column definitions                                                             |
| `apps/web-planner/src/components/grid/cells/{TitleCell,ProgressCell,PriorityCell,DueCell,AssigneesCell,LabelsCell,BucketCell,StartCell,ActionsCell}.tsx` | Create  | Cell renderers                                                                 |
| `apps/web-planner/src/components/grid/BulkActionsBar.tsx`                                                                                                | Create  | Multi-select floating toolbar                                                  |
| `apps/web-planner/src/components/grid/useBulkExecutor.ts`                                                                                                | Create  | Client-loop runner with progress/retry                                         |
| `apps/web-planner/src/components/grid/TaskGrid.spec.tsx`                                                                                                 | Create  | Integration test                                                               |
| `apps/web-planner/src/components/grid/useBulkExecutor.spec.ts`                                                                                           | Create  | Unit test                                                                      |
| `apps/web-planner/src/app/plans/[id]/grid/page.tsx`                                                                                                      | Replace | Drop the ComingSoon placeholder; render `<TaskGrid />`                         |
| `apps/web-planner/e2e/grid.e2e.ts`                                                                                                                       | Create  | Playwright: inline edit + bulk priority + sort column                          |
| `apps/web-planner/src/components/view-picker/ViewPicker.tsx`                                                                                             | Modify  | Enable Grid tab when `planner.grid.enabled` is on                              |

---

## Task 1 — `TaskFlat` shared type

**Files:**

- Create: `packages/api-client/src/planner/task-flat.ts`
- Modify: `packages/api-client/src/planner/index.ts`

- [ ] **Step 1:** Define the type exactly as specified in design §5.1. Keep it framework-agnostic (no Zod dependency here — just TS types).

```ts
// packages/api-client/src/planner/task-flat.ts
export type TaskFlat = {
  id: string
  planId: string
  bucketId: string
  bucketName: string
  bucketOrderHint: string
  title: string
  progress: 'not-started' | 'in-progress' | 'completed'
  priority: 'urgent' | 'important' | 'medium' | 'low'
  startDate: string | null
  dueDate: string | null
  assignees: { actorId: string; displayName: string; avatarUrl: string | null }[]
  labels: { id: string; name: string; color: string }[]
  orderHint: string
  commentCount: number
  checklistCount: { total: number; completed: number }
  attachmentCount: number
  createdAt: string
  updatedAt: string
}
```

- [ ] **Step 2:** Add export from `packages/api-client/src/planner/index.ts`.
- [ ] **Step 3:** Build the package.

```bash
bun run --filter @future/api-client build
```

- [ ] **Step 4:** Commit.

```bash
git add packages/api-client/src/planner/
git commit -m "feat(api-client): add TaskFlat shared type for view layer"
```

---

## Task 2 — Backend: `getFlatTasks` query handler (TDD)

**Files:**

- Create: `apps/api/src/modules/planner/application/queries/tasks/get-flat.query.ts`
- Create: `apps/api/src/modules/planner/application/queries/tasks/get-flat.handler.ts`
- Create: `apps/api/src/modules/planner/application/queries/tasks/get-flat.handler.integration.spec.ts`

- [ ] **Step 1: Write integration spec first.** Use the existing test harness that stands up a real Postgres via Testcontainers (same pattern as `get-board.handler.integration.spec.ts`).

```ts
// get-flat.handler.integration.spec.ts
import { describe, it, expect, beforeAll } from 'vitest'
import { buildPlannerIntegrationHarness } from '../../../testing/planner-harness'

describe('getFlatTasks', () => {
  const h = buildPlannerIntegrationHarness()
  beforeAll(async () => {
    await h.setup()
  })

  it('returns a flat TaskFlat[] matching the plan snapshot', async () => {
    const { plan, tasks } = await h.seedPlanWithTasks({ taskCount: 15, bucketCount: 3 })
    const result = await h.handlers.getFlatTasks.execute(plan.id, h.actor)
    expect(result).toHaveLength(15)
    expect(result[0]).toMatchObject({
      id: expect.any(String),
      planId: plan.id,
      bucketId: expect.any(String),
      bucketName: expect.any(String),
      bucketOrderHint: expect.any(String),
      assignees: expect.any(Array),
      labels: expect.any(Array),
      checklistCount: { total: expect.any(Number), completed: expect.any(Number) },
    })
  })

  it('excludes soft-deleted tasks', async () => {
    const { plan, tasks } = await h.seedPlanWithTasks({ taskCount: 5 })
    await h.softDeleteTask(tasks[0].id)
    const result = await h.handlers.getFlatTasks.execute(plan.id, h.actor)
    expect(result.map((t) => t.id)).not.toContain(tasks[0].id)
  })

  it('enforces RLS: non-member actor sees 404', async () => {
    const { plan } = await h.seedPlanWithTasks({ taskCount: 3 })
    await expect(
      h.handlers.getFlatTasks.execute(plan.id, h.otherTenantActor),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('batches assignee resolution via PeopleQueryFacade (spy assertion)', async () => {
    const { plan } = await h.seedPlanWithTasks({ taskCount: 20, assigneesPerTask: 2 })
    h.peopleFacadeSpy.mockClear()
    await h.handlers.getFlatTasks.execute(plan.id, h.actor)
    expect(h.peopleFacadeSpy).toHaveBeenCalledTimes(1) // one batch call, not one-per-task
  })
})
```

- [ ] **Step 2: Run — fails (handler does not exist).**

```bash
bun run --filter @future/api test:integration -- get-flat
```

- [ ] **Step 3: Implement the query + handler.**

```ts
// get-flat.query.ts
export class GetFlatTasksQuery {
  constructor(
    public readonly planId: string,
    public readonly actorId: string,
  ) {}
}
```

```ts
// get-flat.handler.ts
import { Inject, Injectable } from '@nestjs/common'
import { QueryHandler, IQueryHandler } from '@nestjs/cqrs'
import type { TaskFlat } from '@future/api-client/planner'
import type { ITaskRepository } from '../../../domain/repositories/task.repository'
import { TASK_REPOSITORY } from '../../../domain/repositories/task.repository'
import type { IBucketRepository } from '../../../domain/repositories/bucket.repository'
import { BUCKET_REPOSITORY } from '../../../domain/repositories/bucket.repository'
import type { PeopleQueryFacade } from '@future/people'
import { PLAN_AUTHORIZATION_SERVICE } from '../../services/plan-authorization.service'
import type { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { GetFlatTasksQuery } from './get-flat.query'

@Injectable()
@QueryHandler(GetFlatTasksQuery)
export class GetFlatTasksHandler implements IQueryHandler<GetFlatTasksQuery, TaskFlat[]> {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly tasks: ITaskRepository,
    @Inject(BUCKET_REPOSITORY) private readonly buckets: IBucketRepository,
    @Inject(PLAN_AUTHORIZATION_SERVICE) private readonly auth: PlanAuthorizationService,
    private readonly people: PeopleQueryFacade,
  ) {}

  async execute({ planId, actorId }: GetFlatTasksQuery): Promise<TaskFlat[]> {
    await this.auth.assertCanRead(actorId, planId)

    // Sequential — NOT Promise.all (RLS single-client rule, CLAUDE.md)
    const bucketRows = await this.buckets.listByPlan(planId)
    const taskRows = await this.tasks.listByPlanWithCountsAndJoins(planId)

    const bucketById = new Map(bucketRows.map((b) => [b.id, b]))
    const actorIds = Array.from(new Set(taskRows.flatMap((t) => t.assigneeActorIds)))
    const actors = await this.people.getActorsByIds(actorIds)
    const actorById = new Map(actors.map((a) => [a.actorId, a]))

    return taskRows.map<TaskFlat>((t) => ({
      id: t.id,
      planId: t.planId,
      bucketId: t.bucketId,
      bucketName: bucketById.get(t.bucketId)?.name ?? '',
      bucketOrderHint: bucketById.get(t.bucketId)?.orderHint ?? '',
      title: t.title,
      progress: t.progress,
      priority: t.priority,
      startDate: t.startDate?.toISOString() ?? null,
      dueDate: t.dueDate?.toISOString() ?? null,
      assignees: t.assigneeActorIds
        .map((id) => actorById.get(id))
        .filter((a): a is NonNullable<typeof a> => !!a)
        .map((a) => ({ actorId: a.actorId, displayName: a.displayName, avatarUrl: a.avatarUrl })),
      labels: t.labels.map((l) => ({ id: l.id, name: l.name, color: l.color })),
      orderHint: t.orderHint,
      commentCount: t.commentCount,
      checklistCount: { total: t.checklistCount, completed: t.checklistCheckedCount },
      attachmentCount: t.attachmentCount,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    }))
  }
}
```

- [ ] **Step 4:** If `ITaskRepository.listByPlanWithCountsAndJoins` doesn't exist yet (the #1 `getBoard` used nested-per-bucket structure), add a new repo method that returns flat rows with the same computed counts + assignee IDs + label objects.

- [ ] **Step 5: Run integration tests — expect pass.**

- [ ] **Step 6: Register the handler in `planner.module.ts` providers array.** Grep for `GetBoardHandler` to find where to insert.

- [ ] **Step 7: Commit.**

```bash
git add apps/api/src/modules/planner/application/queries/tasks/ apps/api/src/modules/planner/infrastructure/repositories/
git commit -m "feat(api/planner): getFlatTasks query for view layer"
```

---

## Task 3 — Expose `tasks.getFlat` in the tRPC router (TDD)

**Files:**

- Modify: `apps/api/src/modules/planner/interface/trpc/task.router.ts`

- [ ] **Step 1: Add integration test** to `task.router.integration.spec.ts` covering:
  - Happy path: actor who is a plan member gets the flat list.
  - `NOT_FOUND` mapping for non-member.
  - Input validation rejects missing `planId`.

- [ ] **Step 2: Add the procedure.**

```ts
// task.router.ts — inside the procedures object
getFlat: protectedProcedure
  .input(z.object({ planId: z.string().uuid() }))
  .query(({ input, ctx }) =>
    ctx.queryBus.execute(new GetFlatTasksQuery(input.planId, ctx.actorId)),
  ),
```

- [ ] **Step 3: Run tests — pass.**
- [ ] **Step 4: Commit.**

---

## Task 4 — Install Grid dependencies

- [ ] **Step 1:**

```bash
bun add -F @future/web-planner @tanstack/react-table @tanstack/react-virtual
```

- [ ] **Step 2:** Confirm both packages are pure JS (no native bindings) — ARM64 compatible.
- [ ] **Step 3:** Commit.

```bash
git add apps/web-planner/package.json bun.lock
git commit -m "build(web-planner): add @tanstack/react-table + react-virtual"
```

---

## Task 5 — `useFlatTasks` React Query hook

**Files:**

- Create: `apps/web-planner/src/lib/hooks/useFlatTasks.ts`

- [ ] **Step 1:** Wrap `trpc.planner.tasks.getFlat.useQuery({ planId })` with the zone's standard error mapping. Stale-time: 5 s to keep inline-edits snappy.

```ts
// useFlatTasks.ts
import { useMemo } from 'react'
import { trpc } from '@/lib/trpc'
import { applyTaskFilter } from '@/lib/task-filter'
import { sortTasks } from '@/lib/task-sort'
import { groupTasks } from '@/lib/task-group'
import { useViewState } from '@/lib/view-state'

export function useFlatTasks({ planId }: { planId: string }) {
  const query = trpc.planner.tasks.getFlat.useQuery({ planId }, { staleTime: 5_000 })
  const { state } = useViewState({ planId })

  const processed = useMemo(() => {
    if (!query.data) return undefined
    const filtered = applyTaskFilter(query.data, state.filter)
    const sorted = state.sort ? sortTasks(filtered, state.sort) : filtered
    return { rows: sorted, groups: groupTasks(sorted, state.groupBy) }
  }, [query.data, state.filter, state.sort, state.groupBy])

  return { ...query, processed }
}
```

- [ ] **Step 2: Unit test** — mock the tRPC hook; confirm memoization re-runs only on state change.
- [ ] **Step 3: Commit.**

---

## Task 6 — Column definitions (TDD)

**Files:**

- Create: `apps/web-planner/src/components/grid/columns.tsx`

- [ ] **Step 1: Test** the column definitions produce the right header labels, accessorFns, and sortable flags.

```tsx
// columns.spec.tsx
describe('grid columns', () => {
  it('defines the nine expected columns in order', () => {
    const defs = buildColumns({ editable: true, onOpen: vi.fn(), planMembers: [], planLabels: [] })
    expect(defs.map((c) => c.id ?? c.accessorKey)).toEqual([
      'select',
      'title',
      'bucket',
      'progress',
      'priority',
      'start',
      'due',
      'assignees',
      'labels',
      'actions',
    ])
  })

  it('title + priority + progress + due are sortable; assignees + labels are not', () => {
    const defs = buildColumns({ editable: true, onOpen: vi.fn(), planMembers: [], planLabels: [] })
    const byId = (id: string) => defs.find((d) => (d.id ?? d.accessorKey) === id)
    expect(byId('title')?.enableSorting).toBe(true)
    expect(byId('assignees')?.enableSorting).toBe(false)
  })
})
```

- [ ] **Step 2: Implement** `buildColumns` returning a `ColumnDef<TaskFlat>[]` array. Each cell renderer imports from `cells/`.
- [ ] **Step 3: Run — pass.**
- [ ] **Step 4: Commit.**

---

## Task 7 — Inline-edit cell components

**Files:**

- Create: `apps/web-planner/src/components/grid/cells/*.tsx`

For each of ProgressCell, PriorityCell, DueCell, AssigneesCell, LabelsCell:

- [ ] **Step 1: Write a component test.** Assert clicking the cell opens a Popover whose editor is the same component used in the task detail panel. Assert confirmation fires the expected tRPC mutation.

```tsx
// ProgressCell.spec.tsx
it('opens a progress popover and calls setProgress on confirm', async () => {
  const mutate = vi.fn()
  vi.spyOn(trpc.planner.tasks.setProgress, 'useMutation').mockReturnValue({ mutate } as any)
  render(<ProgressCell task={taskFixture} />)
  await userEvent.click(screen.getByRole('button', { name: /progress/i }))
  await userEvent.click(screen.getByRole('menuitem', { name: /in progress/i }))
  expect(mutate).toHaveBeenCalledWith({
    taskId: taskFixture.id,
    progress: 'in-progress',
    expectedVersion: taskFixture.updatedAt,
  })
})
```

- [ ] **Step 2: Implement each cell** as a thin wrapper around the existing detail-panel editor from Plan #1. Reuse — do not duplicate.

```tsx
// ProgressCell.tsx
'use client'
import { Popover, PopoverContent, PopoverTrigger } from '@future/ui'
import { ProgressBadge } from '@/components/primitives/ProgressBadge' // from #1
import { ProgressEditor } from '@/components/task-detail/ProgressEditor' // from #1
import { trpc } from '@/lib/trpc'
import type { TaskFlat } from '@future/api-client/planner'

export function ProgressCell({ task }: { task: TaskFlat }) {
  const mutation = trpc.planner.tasks.setProgress.useMutation()
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="focus:outline-none focus-visible:ring-2 ring-ring"
          aria-label="Change progress"
        >
          <ProgressBadge value={task.progress} />
        </button>
      </PopoverTrigger>
      <PopoverContent>
        <ProgressEditor
          value={task.progress}
          onChange={(next) =>
            mutation.mutate({ taskId: task.id, progress: next, expectedVersion: task.updatedAt })
          }
        />
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 3:** Title + Bucket + Start cells are non-editable — just render existing badges/text.
- [ ] **Step 4:** Run all cell specs — pass.
- [ ] **Step 5:** Commit.

```bash
git add apps/web-planner/src/components/grid/cells/
git commit -m "feat(web-planner): Grid inline-edit cell components"
```

---

## Task 8 — `TaskGrid` table shell with virtualization

**Files:**

- Create: `apps/web-planner/src/components/grid/TaskGrid.tsx`
- Create: `apps/web-planner/src/components/grid/TaskGrid.spec.tsx`

- [ ] **Step 1: Integration test** renders 200 fixture rows, asserts:
  - Only ~40 rows are in the DOM at once (virtualization).
  - Scrolling reveals more rows.
  - Column header click triggers sort (via `useViewState`).
  - Grouped-by-priority renders section headers in priority order.

```tsx
// TaskGrid.spec.tsx
import { render, screen } from '@testing-library/react'
describe('TaskGrid', () => {
  it('virtualizes a large dataset (only ~40 rows in DOM at 200 fixture)', () => {
    render(<TaskGrid planId="abc" data={fixture200} groups={undefined} />)
    const rows = screen.getAllByRole('row')
    expect(rows.length).toBeLessThan(60)
  })
  it('renders group section headers when groups provided', () => {
    /* … */
  })
  it('clicking a sortable header tri-state toggles sort state', async () => {
    /* … */
  })
})
```

- [ ] **Step 2:** Implement `TaskGrid`.

```tsx
// TaskGrid.tsx
'use client'
import { useMemo, useRef } from 'react'
import { getCoreRowModel, getSortedRowModel, useReactTable } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { buildColumns } from './columns'
import { useViewState } from '@/lib/view-state'
import type { TaskFlat } from '@future/api-client/planner'
import type { TaskGroup } from '@/lib/task-group'

export function TaskGrid({
  planId,
  data,
  groups,
  context,
}: {
  planId: string
  data: TaskFlat[]
  groups: TaskGroup[] | undefined
  context: { members: Member[]; labels: Label[] }
}) {
  const { state, patch } = useViewState({ planId })
  const columns = useMemo(
    () =>
      buildColumns({
        editable: true,
        planMembers: context.members,
        planLabels: context.labels,
        onOpen: (id) =>
          patch({
            /* open detail panel via plan-scoped parallel route */
          }),
      }),
    [context, patch],
  )

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting: state.sort ? [{ id: state.sort.field, desc: state.sort.dir === 'desc' }] : [],
    },
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(table.getState().sorting) : updater
      patch({
        sort: next[0]
          ? { field: next[0].id as any, dir: next[0].desc ? 'desc' : 'asc' }
          : undefined,
      })
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const parentRef = useRef<HTMLDivElement | null>(null)
  const rows = groups
    ? flattenGroupRows(groups)
    : table.getRowModel().rows.map((r) => ({ kind: 'row' as const, row: r }))

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (rows[i].kind === 'header' ? 36 : 48),
    overscan: 10,
    getItemKey: (i) => (rows[i].kind === 'header' ? `h:${rows[i].key}` : rows[i].row.original.id),
  })

  return (
    <div
      ref={parentRef}
      className="relative h-[calc(100vh-11rem)] overflow-auto border-t border-border"
    >
      <table className="w-full">
        <thead className="sticky top-0 z-10 bg-background">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => (
                <ColumnHeader key={h.id} header={h} />
              ))}
            </tr>
          ))}
        </thead>
        <tbody style={{ height: rowVirtualizer.getTotalSize() }}>
          {rowVirtualizer.getVirtualItems().map((v) => (
            <GridRow key={v.key} top={v.start} item={rows[v.index]} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: Run tests — pass.**
- [ ] **Step 4: Commit.**

---

## Task 9 — `useBulkExecutor` client-loop runner (TDD)

**Files:**

- Create: `apps/web-planner/src/components/grid/useBulkExecutor.ts`
- Create: `apps/web-planner/src/components/grid/useBulkExecutor.spec.ts`

- [ ] **Step 1:** Test the executor's state machine.

```ts
// useBulkExecutor.spec.ts
import { renderHook, act } from '@testing-library/react'
import { useBulkExecutor } from './useBulkExecutor'

describe('useBulkExecutor', () => {
  it('runs tasks sequentially and reports progress', async () => {
    const runs: number[] = []
    const { result } = renderHook(() =>
      useBulkExecutor({
        run: async (i: number) => {
          runs.push(i)
          return { ok: true as const }
        },
      }),
    )
    await act(async () => {
      await result.current.start([1, 2, 3])
    })
    expect(runs).toEqual([1, 2, 3])
    expect(result.current.status).toBe('done')
    expect(result.current.successCount).toBe(3)
  })

  it('stops on first error and exposes failed items for retry', async () => {
    const { result } = renderHook(() =>
      useBulkExecutor({
        run: async (i: number) =>
          i === 2 ? { ok: false as const, error: new Error('boom') } : { ok: true as const },
      }),
    )
    await act(async () => {
      await result.current.start([1, 2, 3])
    })
    expect(result.current.status).toBe('error')
    expect(result.current.failedInputs).toEqual([2, 3])
  })

  it('retryFailed re-runs only the failed items', async () => {
    /* … */
  })
})
```

- [ ] **Step 2:** Implement. Sequential execution — await each before starting next. Progress state updates after each.

- [ ] **Step 3:** Run — pass.
- [ ] **Step 4:** Commit.

---

## Task 10 — `BulkActionsBar` floating toolbar

**Files:**

- Create: `apps/web-planner/src/components/grid/BulkActionsBar.tsx`

- [ ] **Step 1: Test** — BulkActionsBar renders when ≥1 row selected; shows buttons for the five bulk actions + Delete; each button opens the corresponding popover editor and on confirm drives `useBulkExecutor`.

- [ ] **Step 2: Implement** — fixed-position bar along `bottom-0`, zone-scoped selection state (not in URL — ephemeral). Delete asks for confirmation via `@future/ui` AlertDialog.

- [ ] **Step 3:** Wire into `TaskGrid` via a selection-state hook (`useRowSelection` from react-table).

- [ ] **Step 4:** Run — pass.
- [ ] **Step 5:** Commit.

---

## Task 11 — Grid page + Integration with shared header

**Files:**

- Replace: `apps/web-planner/src/app/plans/[id]/grid/page.tsx`

- [ ] **Step 1:** Replace the ComingSoon placeholder with:

```tsx
// grid/page.tsx
import { TaskGrid } from '@/components/grid/TaskGrid'
import { useFlatTasks } from '@/lib/hooks/useFlatTasks'
import { Skeleton } from '@future/ui'
import { Alert, AlertDescription } from '@future/ui'

export default function GridPage({ params }: { params: { id: string } }) {
  const { processed, isLoading, error } = useFlatTasks({ planId: params.id })
  const context = usePlanContext(params.id) // members + labels from existing hook

  if (isLoading) return <SkeletonRows count={10} />
  if (error)
    return (
      <Alert variant="destructive">
        <AlertDescription>Failed to load tasks.</AlertDescription>
      </Alert>
    )
  if (processed && processed.rows.length === 0)
    return <EmptyState onClear={/* clear filter action */} />

  return (
    <TaskGrid
      planId={params.id}
      data={processed!.rows}
      groups={processed!.groups}
      context={context}
    />
  )
}
```

- [ ] **Step 2:** Enable the Grid tab in `ViewPicker` by reading the `planner.grid.enabled` flag at the layout level.

- [ ] **Step 3:** Commit.

---

## Task 12 — Perf test: Grid with 2 400 rows

**Files:**

- Create: `apps/web-planner/src/components/grid/TaskGrid.perf.spec.tsx`

- [ ] **Step 1:** Seed 2 400 synthetic tasks. Assert:
  - First render `< 300 ms`.
  - After scrolling 500 px, no more than 60 rows mounted.
  - No dropped frames during a 2-second scroll animation (measure via `performance.mark`).

- [ ] **Step 2:** Run on CI; gate below threshold.
- [ ] **Step 3:** Commit.

---

## Task 13 — Playwright E2E

**Files:**

- Create: `apps/web-planner/e2e/grid.e2e.ts`

- [ ] **Step 1:** Script:
  1. Seed plan with 30 tasks.
  2. Navigate to Grid.
  3. Inline-edit priority of row 0 → urgent. Verify cell updates and a follow-up reload still shows urgent.
  4. Multi-select rows 1, 2, 3. Click Bulk Set Progress → In progress. Wait for progress toast to report "3 of 3." Verify all three show new state.
  5. Sort by Due ascending. Verify first row is soonest-due.
  6. Switch to Board via ViewPicker. Confirm the active filter carries over.

- [ ] **Step 2:** Commit.

---

## Task 14 — Flip `planner.grid.enabled` for SETA tenant

- [ ] **Step 1:** Flip flag on via admin tool.
- [ ] **Step 2:** Smoke test in production-mirror environment.
- [ ] **Step 3:** Open PR.

---

## Acceptance

- `tasks.getFlat` green with integration coverage (RLS, soft-delete exclusion, single batch people lookup).
- Grid renders at 2 400 rows within perf budget.
- Inline-edit for all five quick-fields works; mutations carry `expectedVersion`.
- Bulk actions toolbar works: stop-on-error, retry-failed semantics verified.
- Sort + filter + group-by from Plan 01 apply to Grid without code duplication.
- Coverage ≥70% across new files.

## Risks for this plan

| Risk                                                     | Mitigation                                                                                                                                    |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Row virtualization jitter when filter changes mid-scroll | Stable row keys via `task.id`; reset scroll only when plan changes. Covered by perf test.                                                     |
| Nine columns + long titles overflow on narrow viewports  | Column widths configured via `minSize`; horizontal scroll on parent container below 1280 px.                                                  |
| Inline-edit cells trapping focus on popover              | Accessibility test: `esc` closes popover, focus returns to cell.                                                                              |
| Bulk operations feel slow at high N                      | Client-loop parallelism is 1 by design; progress toast mitigates perception. Promote to server-side only if usage data demands.               |
| `expectedVersion` collisions during fast bulk runs       | On 409 Conflict from any row, pause the loop, show Retry with fresh snapshot; existing conflict-resolver from #1 handles the per-row refetch. |
