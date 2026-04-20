# Plan 3.3 — My Tasks (all four views)

> Covers spec **Plan 3.3** — see [design spec](../../specs/2026-04-20-personal-hubs-design.md) sections 7.1 (`personal.listTasks` / `personal.getCharts`), 8.4 (routes), 8.5 (components), 8.6 (hooks), 8.7 (empty states), Architecture / Query strategy (p95 < 200ms at 2000 tasks), Risks R1.
> Depends on Plan 3.2 merged — `personal.router.ts` exists with `listPlans`; `@future/app-layout` `NavGroup.render` API and `use-tenant-timezone` hook are in place.

**Goal:** Ship `/personal/tasks/{board,grid,schedule,charts}` — the cross-plan "My Tasks" surface. One new cross-plan task query (`personal.listTasks`), one new chart aggregation (`personal.getCharts`), a thin `personal/tasks/layout.tsx` hosting the reused view picker / filter bar / group-by, and four thin view pages that feed the existing Sub-project #2 view components (`TaskGrid`, `BoardColumn*`, `ScheduleCalendar`, `ChartsGrid`) with `TaskFlatWithPlan[]`. Extend `task-group.ts` with a `'plan'` group key. Extend Board and Grid cell rendering with a small `<PlanBadge />` when tasks carry a `planName` (the cross-plan signal). Add `includeCompleted` as a filter chip (default off). Ship a performance test that seeds 2000 tasks across 50 plans for a single actor and asserts p95 < 200ms.

**Architecture:** Live SQL join — no materialization. `ListTasksForActorHandler` issues three sequential queries against the request-bound DB (tenant RLS already applied by `RlsMiddleware`):

1. `planner.task × planner.task_assignee × planner.plan` where `task_assignee.actor_id = :actorId` and personal-plan visibility filter (`plan.owner_actor_id IS NULL OR plan.owner_actor_id = :actorId`). Returns tasks + their `planId`, `planName`, `planKind`.
2. `planner.task_assignee` for task ids from (1) — all assignees for the rows we're returning, including co-assignees.
3. `planner.task_applied_label JOIN planner.plan_label` and counts (attachments, comments) for the same task-id set.

`GetPersonalChartsHandler` delegates to `ListTasksForActorHandler` then feeds the result into a new server-side `computePlannerChartsData(tasks)` function in `apps/api/src/modules/planner/application/lib/charts-data.ts`. (No existing `ChartsDataService` — the client side in `apps/web-planner/src/lib/charts-data.ts` is pure; we port its reducers into a server-side, framework-free helper. The web-planner keeps its own copy for non-personal charts.)

Group-by-Plan: pure client-side extension of `task-group.ts`. `GroupKey` gains `'plan'`; `groupByPlan()` groups on `(planId, planName)` and sorts personal-plan rows first, then team plans alphabetically. Board / Grid / Schedule views render "plan" groups transparently; the existing column primitives accept `TaskGroup[]` — no structural change.

Plan-name badge: a small `<PlanBadge planName planKind />` rendered next to the bucket label on `TaskCard` and in the Grid's bucket cell when `task.planName` is present (i.e. the task came from a cross-plan source). Non-personal plan pages never populate `planName`, so the badge stays hidden there.

**Tech stack:** Existing — tRPC, NestJS CQRS, Drizzle, React Query, `@tanstack/react-table`, ECharts via `@future/charts`. No new deps.

---

## File Map

### Backend — shared type + cross-plan task query

| File                                                                                                         | Action | Purpose                                                                                  |
| ------------------------------------------------------------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------- |
| `packages/api-client/src/planner/task-flat.ts`                                                               | Modify | Add `TaskFlatWithPlan = TaskFlat & { planName: string; planKind: 'team' \| 'personal' }` |
| `packages/api-client/src/planner/index.ts`                                                                   | Modify | Re-export `TaskFlatWithPlan`                                                             |
| `apps/api/src/modules/planner/application/queries/personal/list-tasks-for-actor.query.ts`                    | Create | Query DTO (`actorId`, `tenantId`, `includeCompleted`)                                    |
| `apps/api/src/modules/planner/application/queries/personal/list-tasks-for-actor.handler.ts`                  | Create | Handler — returns `TaskFlatWithPlan[]`                                                   |
| `apps/api/src/modules/planner/application/queries/personal/list-tasks-for-actor.handler.spec.ts`             | Create | Unit tests (mocked DB)                                                                   |
| `apps/api/src/modules/planner/application/queries/personal/list-tasks-for-actor.handler.integration.spec.ts` | Create | Integration test — real Postgres, leak-prevention, personal-plan visibility              |
| `apps/api/src/modules/planner/application/queries/personal/list-tasks-for-actor.handler.performance.spec.ts` | Create | Perf test — 2000 tasks × 50 plans, p95 < 200ms over 20 iterations                        |

### Backend — charts aggregation

| File                                                                                            | Action | Purpose                                                                |
| ----------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------- |
| `apps/api/src/modules/planner/application/lib/charts-data.ts`                                   | Create | Pure server-side chart reducers (`computePlannerChartsData`)           |
| `apps/api/src/modules/planner/application/lib/charts-data.spec.ts`                              | Create | Unit tests                                                             |
| `apps/api/src/modules/planner/application/queries/personal/get-personal-charts.query.ts`        | Create | Query DTO                                                              |
| `apps/api/src/modules/planner/application/queries/personal/get-personal-charts.handler.ts`      | Create | Delegates to `ListTasksForActorQuery`, runs `computePlannerChartsData` |
| `apps/api/src/modules/planner/application/queries/personal/get-personal-charts.handler.spec.ts` | Create | Unit tests                                                             |
| `packages/api-client/src/planner/charts.ts`                                                     | Create | Shared `PlannerChartsData` type                                        |
| `packages/api-client/src/planner/index.ts`                                                      | Modify | Re-export `PlannerChartsData`                                          |

### Backend — tRPC + module wiring

| File                                                                              | Action | Purpose                                                          |
| --------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------- |
| `apps/api/src/modules/planner/interface/trpc/personal.router.ts`                  | Modify | Add `listTasks` + `getCharts` procedures (Zod input schema)      |
| `apps/api/src/modules/planner/interface/trpc/personal.router.integration.spec.ts` | Modify | Cover `listTasks` + `getCharts` procedures                       |
| `apps/api/src/modules/planner/planner.module.ts`                                  | Modify | Register `ListTasksForActorHandler` + `GetPersonalChartsHandler` |

### Frontend — shared logic

| File                                           | Action | Purpose                                                                 |
| ---------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| `apps/web-planner/src/lib/view-state.ts`       | Modify | Add `'plan'` to `GROUP_KEYS`; allow it in URL parser                    |
| `apps/web-planner/src/lib/view-state.spec.ts`  | Modify | Add `'plan'` parse/serialize tests                                      |
| `apps/web-planner/src/lib/task-group.ts`       | Modify | Add `groupByPlan()` branch                                              |
| `apps/web-planner/src/lib/task-group.spec.ts`  | Modify | Cover the new branch (personal first, then alpha)                       |
| `apps/web-planner/src/lib/task-filter.ts`      | Modify | Filter out `progress === 'completed'` unless `includeCompleted` is true |
| `apps/web-planner/src/lib/task-filter.spec.ts` | Modify | Cover `includeCompleted` branch                                         |

### Frontend — hooks

| File                                                         | Action | Purpose                                      |
| ------------------------------------------------------------ | ------ | -------------------------------------------- |
| `apps/web-planner/src/lib/hooks/use-personal-tasks.ts`       | Create | React Query wrapper for `personal.listTasks` |
| `apps/web-planner/src/lib/hooks/use-personal-tasks.spec.ts`  | Create | Unit tests                                   |
| `apps/web-planner/src/lib/hooks/use-personal-charts.ts`      | Create | React Query wrapper for `personal.getCharts` |
| `apps/web-planner/src/lib/hooks/use-personal-charts.spec.ts` | Create | Unit tests                                   |

### Frontend — components

| File                                                                               | Action | Purpose                                                                                  |
| ---------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------- |
| `apps/web-planner/src/components/personal-plan-badge.tsx`                          | Create | Small badge for plan-name + kind                                                         |
| `apps/web-planner/src/components/personal-plan-badge.spec.tsx`                     | Create | Unit test                                                                                |
| `apps/web-planner/src/components/board/TaskCard.tsx`                               | Modify | Render `<PersonalPlanBadge />` when `task.planName` present                              |
| `apps/web-planner/src/components/grid/cells/BucketCell.tsx`                        | Modify | Render `<PersonalPlanBadge />` next to bucket name when `task.planName` present          |
| `apps/web-planner/src/components/filter-bar/filters/IncludeCompletedChip.tsx`      | Create | Boolean-toggle chip                                                                      |
| `apps/web-planner/src/components/filter-bar/filters/IncludeCompletedChip.spec.tsx` | Create | Unit test                                                                                |
| `apps/web-planner/src/components/filter-bar/FilterBar.tsx`                         | Modify | Surface `IncludeCompletedChip` when `mode === 'personal'`                                |
| `apps/web-planner/src/components/filter-bar/types.ts`                              | Modify | Add `includeCompleted?: boolean` to `PlanContext`; add `mode: 'plan' \| 'personal'` prop |
| `apps/web-planner/src/components/group-by/GroupByPicker.tsx`                       | Modify | Accept `availableKeys` prop; default includes `'plan'` on personal pages                 |

### Frontend — routes

| File                                                             | Action | Purpose                                                             |
| ---------------------------------------------------------------- | ------ | ------------------------------------------------------------------- |
| `apps/web-planner/src/app/personal/tasks/layout.tsx`             | Create | Two-row header: view-picker + filter-bar + group-by (personal mode) |
| `apps/web-planner/src/app/personal/tasks/layout.spec.tsx`        | Create | Unit test — view picker renders, filter bar in personal mode        |
| `apps/web-planner/src/app/personal/tasks/board/page.tsx`         | Create | Board view over `personal.listTasks`                                |
| `apps/web-planner/src/app/personal/tasks/board/page.spec.tsx`    | Create | Integration test — empty state + populated                          |
| `apps/web-planner/src/app/personal/tasks/grid/page.tsx`          | Create | Grid view over `personal.listTasks`                                 |
| `apps/web-planner/src/app/personal/tasks/grid/page.spec.tsx`     | Create | Integration test                                                    |
| `apps/web-planner/src/app/personal/tasks/schedule/page.tsx`      | Create | Schedule view over `personal.listTasks`                             |
| `apps/web-planner/src/app/personal/tasks/schedule/page.spec.tsx` | Create | Integration test                                                    |
| `apps/web-planner/src/app/personal/tasks/charts/page.tsx`        | Create | Charts view over `personal.getCharts`                               |
| `apps/web-planner/src/app/personal/tasks/charts/page.spec.tsx`   | Create | Integration test                                                    |

### Indices — verify / add

| File                                                                   | Action | Purpose                                                                                |
| ---------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------- |
| `apps/api/src/modules/planner/infrastructure/schema/planner.schema.ts` | Modify | If the perf test's EXPLAIN reveals a missing index, add it here + regenerate migration |

### Dependencies

No new workspace dependencies. All run-time libraries already installed.

---

## Task 1 — `TaskFlatWithPlan` shared type

**Files:**

- Modify: `packages/api-client/src/planner/task-flat.ts`
- Modify: `packages/api-client/src/planner/index.ts`

- [ ] **Step 1: Extend the shared type.**

```ts
// packages/api-client/src/planner/task-flat.ts — append to existing file
export type TaskFlatWithPlan = TaskFlat & {
  planName: string
  planKind: 'team' | 'personal'
}
```

- [ ] **Step 2: Re-export from the package index.**

```ts
// packages/api-client/src/planner/index.ts — ensure this export exists
export type { TaskFlat, TaskFlatWithPlan } from './task-flat'
```

- [ ] **Step 3: Build the package.**

```bash
bun run --filter @future/api-client build
```

- [ ] **Step 4: Commit.**

```bash
git add packages/api-client/src/planner/
git commit -m "feat(api-client): add TaskFlatWithPlan shared type"
```

---

## Task 2 — `ListTasksForActorQuery` + handler (TDD, unit first)

**Files:**

- Create: `apps/api/src/modules/planner/application/queries/personal/list-tasks-for-actor.query.ts`
- Create: `apps/api/src/modules/planner/application/queries/personal/list-tasks-for-actor.handler.ts`
- Create: `apps/api/src/modules/planner/application/queries/personal/list-tasks-for-actor.handler.spec.ts`

- [ ] **Step 1: Write the failing unit spec.**

```ts
// list-tasks-for-actor.handler.spec.ts
import { Test } from '@nestjs/testing'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ListTasksForActorHandler } from './list-tasks-for-actor.handler'
import { ListTasksForActorQuery } from './list-tasks-for-actor.query'
import { DB_TOKEN } from '../../../../../common/db/db.module'
import { KernelQueryFacade } from '../../../../kernel/application/facades/kernel-query.facade'

describe('ListTasksForActorHandler', () => {
  const actorId = '00000000-0000-0000-0000-0000000000aa'
  const tenantId = '00000000-0000-0000-0000-0000000000bb'
  let handler: ListTasksForActorHandler
  let db: { execute: ReturnType<typeof vi.fn> }
  let kernel: { getActorsByIds: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    db = { execute: vi.fn() }
    kernel = { getActorsByIds: vi.fn().mockResolvedValue(new Map()) }
    const mod = await Test.createTestingModule({
      providers: [
        ListTasksForActorHandler,
        { provide: DB_TOKEN, useValue: db },
        { provide: KernelQueryFacade, useValue: kernel },
      ],
    }).compile()
    handler = mod.get(ListTasksForActorHandler)
  })

  it('returns TaskFlatWithPlan[] with planName and planKind populated', async () => {
    db.execute
      // Query 1: tasks + plan join
      .mockResolvedValueOnce({
        rows: [
          {
            task_id: 't1',
            plan_id: 'p1',
            plan_name: 'Team Alpha',
            plan_owner_actor_id: null,
            bucket_id: 'b1',
            bucket_name: 'To do',
            bucket_order_hint: '0|hzzzzz:',
            title: 'Ship it',
            progress: 50,
            priority: 5,
            start_date: null,
            due_date: null,
            order_hint: '0|azzzzz:',
            checklist_item_count: 0,
            checklist_checked_count: 0,
            attachment_count: 0,
            comment_count: 0,
            created_at: new Date('2026-04-20T00:00:00Z'),
            updated_at: new Date('2026-04-20T00:00:00Z'),
          },
        ],
      })
      // Query 2: assignees (co-assignees included)
      .mockResolvedValueOnce({
        rows: [{ task_id: 't1', actor_id: actorId }],
      })
      // Query 3: labels
      .mockResolvedValueOnce({ rows: [] })

    const result = await handler.execute(
      new ListTasksForActorQuery(actorId, tenantId, { includeCompleted: false }),
    )

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 't1',
      planId: 'p1',
      planName: 'Team Alpha',
      planKind: 'team',
      progress: 'in-progress',
      priority: 'medium',
    })
  })

  it('marks plan as personal when owner_actor_id equals the actor', async () => {
    db.execute
      .mockResolvedValueOnce({
        rows: [
          {
            task_id: 't2',
            plan_id: 'pp1',
            plan_name: 'Personal',
            plan_owner_actor_id: actorId,
            bucket_id: 'b2',
            bucket_name: 'Inbox',
            bucket_order_hint: '0|hzzzzz:',
            title: 'Write tests',
            progress: 0,
            priority: 5,
            start_date: null,
            due_date: null,
            order_hint: '0|bzzzzz:',
            checklist_item_count: 0,
            checklist_checked_count: 0,
            attachment_count: 0,
            comment_count: 0,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ task_id: 't2', actor_id: actorId }] })
      .mockResolvedValueOnce({ rows: [] })

    const [task] = await handler.execute(
      new ListTasksForActorQuery(actorId, tenantId, { includeCompleted: false }),
    )
    expect(task!.planKind).toBe('personal')
  })

  it('excludes completed tasks by default (includeCompleted=false)', async () => {
    db.execute
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
    await handler.execute(
      new ListTasksForActorQuery(actorId, tenantId, { includeCompleted: false }),
    )
    const sql = (db.execute.mock.calls[0]?.[0] as { strings?: string[] }).strings?.join(' ') ?? ''
    expect(sql).toMatch(/progress\s*<\s*100/i)
  })

  it('includes completed tasks when includeCompleted=true', async () => {
    db.execute
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
    await handler.execute(new ListTasksForActorQuery(actorId, tenantId, { includeCompleted: true }))
    const sql = (db.execute.mock.calls[0]?.[0] as { strings?: string[] }).strings?.join(' ') ?? ''
    expect(sql).not.toMatch(/progress\s*<\s*100/i)
  })

  it('issues queries sequentially (no Promise.all)', async () => {
    let inFlight = 0
    let maxConcurrent = 0
    db.execute.mockImplementation(async () => {
      inFlight += 1
      maxConcurrent = Math.max(maxConcurrent, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight -= 1
      return { rows: [] }
    })
    await handler.execute(
      new ListTasksForActorQuery(actorId, tenantId, { includeCompleted: false }),
    )
    expect(maxConcurrent).toBe(1) // RLS single-client constraint
  })
})
```

- [ ] **Step 2: Run — expect failure.**

```bash
bun test apps/api/src/modules/planner/application/queries/personal/list-tasks-for-actor.handler.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the query class.**

```ts
// list-tasks-for-actor.query.ts
export interface ListTasksForActorOptions {
  includeCompleted: boolean
}

export class ListTasksForActorQuery {
  constructor(
    public readonly actorId: string,
    public readonly tenantId: string,
    public readonly options: ListTasksForActorOptions,
  ) {}
}
```

- [ ] **Step 4: Create the handler.**

```ts
// list-tasks-for-actor.handler.ts
import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import type { Db } from '@future/db'
import type { TaskFlatWithPlan } from '@future/api-client/planner'
import { sql } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../../common/db/db.module'
import { KernelQueryFacade } from '../../../../kernel/application/facades/kernel-query.facade'
import { ListTasksForActorQuery } from './list-tasks-for-actor.query'

function mapProgress(p: number): TaskFlatWithPlan['progress'] {
  if (p === 100) return 'completed'
  if (p === 50) return 'in-progress'
  return 'not-started'
}

function mapPriority(p: number): TaskFlatWithPlan['priority'] {
  if (p === 1) return 'urgent'
  if (p === 3) return 'important'
  if (p === 9) return 'low'
  return 'medium'
}

@QueryHandler(ListTasksForActorQuery)
export class ListTasksForActorHandler implements IQueryHandler<
  ListTasksForActorQuery,
  TaskFlatWithPlan[]
> {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly kernelQueryFacade: KernelQueryFacade,
  ) {}

  async execute(query: ListTasksForActorQuery): Promise<TaskFlatWithPlan[]> {
    const { actorId, tenantId, options } = query
    const progressFilter = options.includeCompleted ? sql`TRUE` : sql`t.progress < 100`

    // ── Query 1: Tasks joined to plan + bucket, filtered by assignee + visibility ─
    const taskResult = await this.db.execute<{
      task_id: string
      plan_id: string
      plan_name: string
      plan_owner_actor_id: string | null
      bucket_id: string
      bucket_name: string
      bucket_order_hint: string
      title: string
      progress: number
      priority: number
      start_date: string | null
      due_date: string | null
      order_hint: string
      checklist_item_count: number
      checklist_checked_count: number
      attachment_count: number
      comment_count: number
      created_at: Date
      updated_at: Date
    }>(
      sql`SELECT
            t.id                                AS task_id,
            p.id                                AS plan_id,
            p.name                              AS plan_name,
            p.owner_actor_id                    AS plan_owner_actor_id,
            t.bucket_id,
            b.name                              AS bucket_name,
            b.order_hint                        AS bucket_order_hint,
            t.title,
            t.progress,
            t.priority,
            t.start_date,
            t.due_date,
            t.order_hint,
            COALESCE(t.checklist_item_count, 0) AS checklist_item_count,
            COALESCE(t.checklist_checked_count, 0) AS checklist_checked_count,
            (SELECT COUNT(*)::int FROM planner.task_attachment ta
              WHERE ta.task_id = t.id AND ta.tenant_id = ${tenantId}) AS attachment_count,
            (SELECT COUNT(*)::int FROM planner.task_comment tc
              WHERE tc.task_id = t.id AND tc.tenant_id = ${tenantId}
                AND tc.deleted_at IS NULL) AS comment_count,
            t.created_at,
            t.updated_at
          FROM planner.task t
          JOIN planner.task_assignee ta
            ON ta.task_id = t.id
            AND ta.tenant_id = t.tenant_id
          JOIN planner.plan p
            ON p.id = t.plan_id
            AND p.tenant_id = t.tenant_id
            AND p.deleted_at IS NULL
          LEFT JOIN planner.bucket b
            ON b.id = t.bucket_id
            AND b.tenant_id = t.tenant_id
            AND b.deleted_at IS NULL
          WHERE ta.actor_id = ${actorId}
            AND t.tenant_id = ${tenantId}
            AND t.deleted_at IS NULL
            AND (p.owner_actor_id IS NULL OR p.owner_actor_id = ${actorId})
            AND ${progressFilter}
          ORDER BY p.name ASC, b.order_hint NULLS LAST, t.order_hint NULLS LAST`,
    )

    if (taskResult.rows.length === 0) return []
    const taskIds = taskResult.rows.map((r) => r.task_id)

    // ── Query 2: Co-assignees for returned tasks (actor may share tasks) ─────
    const assigneeResult = await this.db.execute<{ task_id: string; actor_id: string }>(
      sql`SELECT ta.task_id, ta.actor_id
          FROM planner.task_assignee ta
          WHERE ta.tenant_id = ${tenantId}
            AND ta.task_id = ANY(${taskIds}::uuid[])`,
    )

    // ── Query 3: Labels for returned tasks ───────────────────────────────────
    const labelResult = await this.db.execute<{
      task_id: string
      slot: string
      label_name: string
      label_color: string
    }>(
      sql`SELECT al.task_id, al.slot, pl.name AS label_name, pl.color AS label_color
          FROM planner.task_applied_label al
          JOIN planner.plan_label pl
            ON pl.plan_id = al.plan_id
            AND pl.slot = al.slot
            AND pl.tenant_id = al.tenant_id
          WHERE al.tenant_id = ${tenantId}
            AND al.task_id = ANY(${taskIds}::uuid[])`,
    )

    const assigneesByTaskId = new Map<string, string[]>()
    for (const r of assigneeResult.rows) {
      const list = assigneesByTaskId.get(r.task_id) ?? []
      list.push(r.actor_id)
      assigneesByTaskId.set(r.task_id, list)
    }

    const labelsByTaskId = new Map<string, Array<{ id: string; name: string; color: string }>>()
    for (const r of labelResult.rows) {
      const list = labelsByTaskId.get(r.task_id) ?? []
      list.push({ id: r.slot, name: r.label_name, color: r.label_color })
      labelsByTaskId.set(r.task_id, list)
    }

    // Batch-resolve actors once
    const allActorIds = Array.from(new Set([...assigneesByTaskId.values()].flat()))
    const actorMap = await this.kernelQueryFacade.getActorsByIds(allActorIds, tenantId)

    return taskResult.rows.map<TaskFlatWithPlan>((r) => {
      const actorIds = assigneesByTaskId.get(r.task_id) ?? []
      const assignees = actorIds.map((id) => {
        const actor = actorMap.get(id)
        return {
          actorId: id,
          displayName: actor?.displayName ?? '',
          avatarUrl: null,
        }
      })

      return {
        id: r.task_id,
        planId: r.plan_id,
        planName: r.plan_name,
        planKind: r.plan_owner_actor_id === null ? 'team' : 'personal',
        bucketId: r.bucket_id,
        bucketName: r.bucket_name,
        bucketOrderHint: r.bucket_order_hint,
        title: r.title,
        progress: mapProgress(Number(r.progress)),
        priority: mapPriority(Number(r.priority)),
        startDate: r.start_date ? new Date(r.start_date).toISOString() : null,
        dueDate: r.due_date ? new Date(r.due_date).toISOString() : null,
        assignees,
        labels: labelsByTaskId.get(r.task_id) ?? [],
        orderHint: r.order_hint,
        commentCount: Number(r.comment_count),
        checklistCount: {
          total: Number(r.checklist_item_count),
          completed: Number(r.checklist_checked_count),
        },
        attachmentCount: Number(r.attachment_count),
        createdAt: r.created_at.toISOString(),
        updatedAt: r.updated_at.toISOString(),
      }
    })
  }
}
```

- [ ] **Step 5: Register in `planner.module.ts`.**

Open `apps/api/src/modules/planner/planner.module.ts` and add `ListTasksForActorHandler` to the `providers` array (next to the existing personal-plan handlers from 3.1 / 3.2).

- [ ] **Step 6: Run the unit tests — expect pass.**

```bash
bun test apps/api/src/modules/planner/application/queries/personal/list-tasks-for-actor.handler.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add apps/api/src/modules/planner/application/queries/personal/ apps/api/src/modules/planner/planner.module.ts
git commit -m "feat(planner): ListTasksForActor query + handler (cross-plan My Tasks)"
```

---

## Task 3 — `ListTasksForActor` integration test (real Postgres)

**Files:**

- Create: `apps/api/src/modules/planner/application/queries/personal/list-tasks-for-actor.handler.integration.spec.ts`

- [ ] **Step 1: Write the integration spec.**

```ts
// list-tasks-for-actor.handler.integration.spec.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildPlannerIntegrationHarness } from '../../../testing/planner-harness'

describe('ListTasksForActor (integration)', () => {
  const h = buildPlannerIntegrationHarness()
  beforeAll(async () => {
    await h.setup()
  })
  afterAll(async () => {
    await h.teardown()
  })

  it('returns tasks from every team plan the actor is assigned to', async () => {
    const [planA, planB] = await Promise.all([
      h.seedPlan({ name: 'Alpha' }),
      h.seedPlan({ name: 'Beta' }),
    ])
    await h.seedTask({ planId: planA.id, assigneeIds: [h.actor.id], title: 'A1' })
    await h.seedTask({ planId: planB.id, assigneeIds: [h.actor.id], title: 'B1' })

    const tasks = await h.handlers.listTasksForActor.execute(h.actor.id, h.tenant.id, {
      includeCompleted: false,
    })
    expect(tasks.map((t) => t.title).sort()).toEqual(['A1', 'B1'])
    expect(new Set(tasks.map((t) => t.planKind))).toEqual(new Set(['team']))
  })

  it("includes the actor's own personal plan", async () => {
    const personal = await h.seedPersonalPlan({ ownerActorId: h.actor.id })
    await h.seedTask({ planId: personal.id, assigneeIds: [h.actor.id], title: 'Pr1' })

    const tasks = await h.handlers.listTasksForActor.execute(h.actor.id, h.tenant.id, {
      includeCompleted: false,
    })
    const personalTask = tasks.find((t) => t.title === 'Pr1')!
    expect(personalTask).toBeDefined()
    expect(personalTask.planKind).toBe('personal')
  })

  it("NEVER leaks another actor's personal plan (regression guard for R5)", async () => {
    const otherActor = await h.seedActor({ tenantId: h.tenant.id })
    const otherPersonal = await h.seedPersonalPlan({ ownerActorId: otherActor.id })
    // Even if somehow our actor got assigned to a task in someone else's personal plan,
    // the visibility filter must drop it.
    await h.seedTask({ planId: otherPersonal.id, assigneeIds: [h.actor.id], title: 'Leak' })

    const tasks = await h.handlers.listTasksForActor.execute(h.actor.id, h.tenant.id, {
      includeCompleted: false,
    })
    expect(tasks.find((t) => t.title === 'Leak')).toBeUndefined()
  })

  it('excludes soft-deleted tasks and soft-deleted plans', async () => {
    const plan = await h.seedPlan({ name: 'Alive' })
    const t1 = await h.seedTask({ planId: plan.id, assigneeIds: [h.actor.id], title: 'Keep' })
    const t2 = await h.seedTask({ planId: plan.id, assigneeIds: [h.actor.id], title: 'Drop' })
    await h.softDeleteTask(t2.id)

    const tasks = await h.handlers.listTasksForActor.execute(h.actor.id, h.tenant.id, {
      includeCompleted: false,
    })
    expect(tasks.map((t) => t.title)).toEqual(['Keep'])

    await h.softDeletePlan(plan.id)
    const after = await h.handlers.listTasksForActor.execute(h.actor.id, h.tenant.id, {
      includeCompleted: false,
    })
    expect(after.find((t) => t.id === t1.id)).toBeUndefined()
  })

  it('excludes completed tasks by default; includes them when includeCompleted=true', async () => {
    const plan = await h.seedPlan({ name: 'Completion' })
    const done = await h.seedTask({ planId: plan.id, assigneeIds: [h.actor.id], title: 'Done' })
    await h.setTaskProgress(done.id, 100)

    const hidden = await h.handlers.listTasksForActor.execute(h.actor.id, h.tenant.id, {
      includeCompleted: false,
    })
    const shown = await h.handlers.listTasksForActor.execute(h.actor.id, h.tenant.id, {
      includeCompleted: true,
    })
    expect(hidden.find((t) => t.id === done.id)).toBeUndefined()
    expect(shown.find((t) => t.id === done.id)).toBeDefined()
  })

  it('enforces tenant isolation — actor from tenant B sees nothing from tenant A', async () => {
    const plan = await h.seedPlan({ name: 'TenantA' })
    await h.seedTask({ planId: plan.id, assigneeIds: [h.actor.id], title: 'Only-A' })
    const other = await h.seedActor({ tenantId: h.otherTenant.id })

    const tasks = await h.handlers.listTasksForActor.execute(other.id, h.otherTenant.id, {
      includeCompleted: false,
    })
    expect(tasks).toEqual([])
  })
})
```

- [ ] **Step 2: Extend the integration harness** — if missing helpers, add them to `apps/api/src/modules/planner/testing/planner-harness.ts`:

```ts
// planner-harness.ts — add (or verify) these methods:
seedPersonalPlan({ ownerActorId }: { ownerActorId: string }): Promise<{ id: string }>
setTaskProgress(taskId: string, progress: number): Promise<void>
softDeletePlan(planId: string): Promise<void>
seedActor({ tenantId }: { tenantId: string }): Promise<{ id: string }>
// and expose: handlers.listTasksForActor
```

- [ ] **Step 3: Run — expect pass.**

```bash
bun test apps/api/src/modules/planner/application/queries/personal/list-tasks-for-actor.handler.integration.spec.ts
```

Expected: PASS. If any test fails on visibility, fix the handler's WHERE clause before moving on — this is the R5 regression guard.

- [ ] **Step 4: Commit.**

```bash
git add apps/api/src/modules/planner/application/queries/personal/list-tasks-for-actor.handler.integration.spec.ts apps/api/src/modules/planner/testing/
git commit -m "test(planner): ListTasksForActor integration + personal-plan leak guard"
```

---

## Task 4 — Performance test: p95 < 200ms at 2000 tasks × 50 plans

**Files:**

- Create: `apps/api/src/modules/planner/application/queries/personal/list-tasks-for-actor.handler.performance.spec.ts`

Performance is a first-class acceptance criterion (spec Risks R1). This test **must** fail noisily when any future change regresses p95 above 200ms.

- [ ] **Step 1: Write the perf spec.**

```ts
// list-tasks-for-actor.handler.performance.spec.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { performance } from 'node:perf_hooks'
import { buildPlannerIntegrationHarness } from '../../../testing/planner-harness'

const TASK_COUNT = 2000
const PLAN_COUNT = 50
const ITERATIONS = 20
const P95_BUDGET_MS = 200

describe('ListTasksForActor (performance)', () => {
  const h = buildPlannerIntegrationHarness()
  beforeAll(async () => {
    await h.setup()
    // Seed 50 plans, 40 tasks per plan, all assigned to h.actor
    for (let pi = 0; pi < PLAN_COUNT; pi += 1) {
      const plan = await h.seedPlan({ name: `Plan ${pi}` })
      const perPlan = TASK_COUNT / PLAN_COUNT
      for (let ti = 0; ti < perPlan; ti += 1) {
        await h.seedTask({
          planId: plan.id,
          assigneeIds: [h.actor.id],
          title: `P${pi}T${ti}`,
        })
      }
    }
    // Statistics update to give the planner realistic row counts
    await h.db.execute(`ANALYZE planner.task`)
    await h.db.execute(`ANALYZE planner.task_assignee`)
    await h.db.execute(`ANALYZE planner.plan`)
  }, 120_000)
  afterAll(async () => {
    await h.teardown()
  })

  it('runs p95 < 200ms over 20 iterations', async () => {
    const timings: number[] = []
    // Warm the connection + caches
    for (let i = 0; i < 3; i += 1) {
      await h.handlers.listTasksForActor.execute(h.actor.id, h.tenant.id, {
        includeCompleted: false,
      })
    }
    for (let i = 0; i < ITERATIONS; i += 1) {
      const start = performance.now()
      const rows = await h.handlers.listTasksForActor.execute(h.actor.id, h.tenant.id, {
        includeCompleted: false,
      })
      timings.push(performance.now() - start)
      expect(rows.length).toBe(TASK_COUNT)
    }
    timings.sort((a, b) => a - b)
    const p95 = timings[Math.floor(timings.length * 0.95) - 1]!
    console.log(
      `[perf] ListTasksForActor ×${ITERATIONS}: p50=${timings[Math.floor(timings.length / 2)]!.toFixed(1)}ms p95=${p95.toFixed(1)}ms`,
    )
    expect(p95).toBeLessThan(P95_BUDGET_MS)
  })

  it('uses the expected indices (EXPLAIN ANALYZE)', async () => {
    const result = await h.db.execute<{ 'QUERY PLAN': string }>(
      `EXPLAIN (ANALYZE, FORMAT TEXT)
       SELECT t.id FROM planner.task t
         JOIN planner.task_assignee ta ON ta.task_id = t.id AND ta.tenant_id = t.tenant_id
         JOIN planner.plan p           ON p.id       = t.plan_id AND p.tenant_id = t.tenant_id
        WHERE ta.actor_id = '${h.actor.id}'
          AND t.tenant_id = '${h.tenant.id}'
          AND t.deleted_at IS NULL
          AND (p.owner_actor_id IS NULL OR p.owner_actor_id = '${h.actor.id}')
          AND t.progress < 100`,
    )
    const plan = result.rows.map((r) => r['QUERY PLAN']).join('\n')
    console.log(plan)
    // Must use the task_assignee(tenant_id, actor_id) index for the anchor seek
    expect(plan).toMatch(/Index (Scan|Only Scan).*task_assignee/i)
    // Must NOT do a sequential scan on planner.task (regression guard)
    expect(plan).not.toMatch(/Seq Scan on planner\.task\b/i)
  })
})
```

- [ ] **Step 2: Run the perf spec.**

```bash
bun test apps/api/src/modules/planner/application/queries/personal/list-tasks-for-actor.handler.performance.spec.ts --testTimeout=180000
```

Expected outcomes:

- **PASS**: p95 under 200ms, EXPLAIN shows index scans. Done.
- **FAIL on index check**: EXPLAIN reveals sequential scan or missing anchor index. Go to Step 3.
- **FAIL on p95 budget**: add composite / covering index and re-run.

- [ ] **Step 3: (Conditional) Add the missing index.**

Spec §3 "Architecture — Query strategy" already committed in Plan 3.1:

- `planner.task_assignee(tenant_id, actor_id)` — exists
- `planner.plan(tenant_id, owner_actor_id) WHERE owner_actor_id IS NOT NULL` — exists

If the EXPLAIN shows a seq scan on `planner.task`, it is almost certainly because the join chooses to drive from `plan` first. Add a covering index on the task side:

```ts
// apps/api/src/modules/planner/infrastructure/schema/planner.schema.ts — add to task table indices
index('idx_task_tenant_plan_deleted_at')
  .on(t.tenantId, t.planId, t.deletedAt),
```

Then: `bun run db:generate && bun run db:migrate` — include the new SQL in the commit. Re-run the perf spec until it passes.

- [ ] **Step 4: Commit (with or without the index, depending on Step 3).**

```bash
git add apps/api/src/modules/planner/application/queries/personal/list-tasks-for-actor.handler.performance.spec.ts
# If the index was needed:
# git add apps/api/src/modules/planner/infrastructure/schema/planner.schema.ts packages/db/drizzle/migrations/
git commit -m "test(planner): ListTasksForActor p95<200ms at 2000 tasks × 50 plans"
```

---

## Task 5 — Server-side charts reducers (`charts-data.ts`)

**Files:**

- Create: `apps/api/src/modules/planner/application/lib/charts-data.ts`
- Create: `apps/api/src/modules/planner/application/lib/charts-data.spec.ts`
- Create: `packages/api-client/src/planner/charts.ts`
- Modify: `packages/api-client/src/planner/index.ts`

The server-side helper is a fresh, framework-free port of the client-side reducers in `apps/web-planner/src/lib/charts-data.ts`. We keep both copies intentionally: the web-planner copy drives per-plan Charts; the API copy aggregates cross-plan for `personal.getCharts`. No shared runtime package — `@future/api-client` is type-only and the server cannot import from `apps/web-planner`.

- [ ] **Step 1: Add the shared output type.**

```ts
// packages/api-client/src/planner/charts.ts
import type { TaskFlat, TaskFlatWithPlan } from './task-flat'

export type ProgressCounts = Record<TaskFlat['progress'], number>
export type PriorityCounts = Record<TaskFlat['priority'], number>

export interface BucketRow {
  bucketId: string
  bucketName: string
  count: number
  hint: string
}

export interface WorkloadRow {
  actorId: string
  displayName: string
  avatarUrl: string | null
  total: number
  perPriority: PriorityCounts
}

export interface PlannerChartsData {
  progress: ProgressCounts
  priority: PriorityCounts
  bucket: BucketRow[]
  workload: WorkloadRow[]
  lateUpcoming: { late: TaskFlatWithPlan[]; upcoming: TaskFlatWithPlan[] }
}
```

Export from `packages/api-client/src/planner/index.ts`:

```ts
export type {
  PlannerChartsData,
  ProgressCounts,
  PriorityCounts,
  BucketRow,
  WorkloadRow,
} from './charts'
```

- [ ] **Step 2: Write the failing spec.**

```ts
// apps/api/src/modules/planner/application/lib/charts-data.spec.ts
import { describe, it, expect } from 'vitest'
import type { TaskFlatWithPlan } from '@future/api-client/planner'
import { computePlannerChartsData } from './charts-data'

function task(overrides: Partial<TaskFlatWithPlan> = {}): TaskFlatWithPlan {
  return {
    id: overrides.id ?? 't',
    planId: 'p1',
    planName: 'P',
    planKind: 'team',
    bucketId: 'b1',
    bucketName: 'To do',
    bucketOrderHint: '0|a:',
    title: 't',
    progress: 'not-started',
    priority: 'medium',
    startDate: null,
    dueDate: null,
    assignees: [],
    labels: [],
    orderHint: '0|a:',
    commentCount: 0,
    checklistCount: { total: 0, completed: 0 },
    attachmentCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('computePlannerChartsData', () => {
  it('returns zero-counts for an empty list', () => {
    const out = computePlannerChartsData([])
    expect(out.progress).toEqual({ 'not-started': 0, 'in-progress': 0, completed: 0 })
    expect(out.priority).toEqual({ urgent: 0, important: 0, medium: 0, low: 0 })
    expect(out.bucket).toEqual([])
    expect(out.workload).toEqual([])
    expect(out.lateUpcoming.late).toEqual([])
    expect(out.lateUpcoming.upcoming).toEqual([])
  })

  it('aggregates progress + priority counts', () => {
    const out = computePlannerChartsData([
      task({ id: '1', progress: 'in-progress', priority: 'urgent' }),
      task({ id: '2', progress: 'completed', priority: 'low' }),
      task({ id: '3', progress: 'in-progress', priority: 'urgent' }),
    ])
    expect(out.progress).toEqual({ 'not-started': 0, 'in-progress': 2, completed: 1 })
    expect(out.priority).toEqual({ urgent: 2, important: 0, medium: 0, low: 1 })
  })

  it('groups workload by assignee, excluding completed tasks', () => {
    const out = computePlannerChartsData([
      task({
        id: '1',
        progress: 'in-progress',
        priority: 'urgent',
        assignees: [{ actorId: 'a1', displayName: 'Alice', avatarUrl: null }],
      }),
      task({
        id: '2',
        progress: 'completed',
        priority: 'urgent',
        assignees: [{ actorId: 'a1', displayName: 'Alice', avatarUrl: null }],
      }),
    ])
    expect(out.workload).toEqual([
      expect.objectContaining({
        actorId: 'a1',
        total: 1,
        perPriority: expect.objectContaining({ urgent: 1 }),
      }),
    ])
  })
})
```

- [ ] **Step 3: Run — expect failure.**

```bash
bun test apps/api/src/modules/planner/application/lib/charts-data.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement.**

```ts
// apps/api/src/modules/planner/application/lib/charts-data.ts
import type {
  TaskFlatWithPlan,
  PlannerChartsData,
  ProgressCounts,
  PriorityCounts,
  BucketRow,
  WorkloadRow,
} from '@future/api-client/planner'

export function computePlannerChartsData(
  tasks: TaskFlatWithPlan[],
  now: Date = new Date(),
): PlannerChartsData {
  const progress: ProgressCounts = { 'not-started': 0, 'in-progress': 0, completed: 0 }
  const priority: PriorityCounts = { urgent: 0, important: 0, medium: 0, low: 0 }
  const bucketMap = new Map<string, { bucketName: string; count: number; hint: string }>()
  const workloadMap = new Map<string, WorkloadRow>()

  for (const t of tasks) {
    progress[t.progress] += 1
    priority[t.priority] += 1

    const b = bucketMap.get(t.bucketId)
    if (b) b.count += 1
    else bucketMap.set(t.bucketId, { bucketName: t.bucketName, count: 1, hint: t.bucketOrderHint })

    if (t.progress !== 'completed') {
      for (const a of t.assignees) {
        let row = workloadMap.get(a.actorId)
        if (!row) {
          row = {
            actorId: a.actorId,
            displayName: a.displayName,
            avatarUrl: a.avatarUrl,
            total: 0,
            perPriority: { urgent: 0, important: 0, medium: 0, low: 0 },
          }
          workloadMap.set(a.actorId, row)
        }
        row.total += 1
        row.perPriority[t.priority] += 1
      }
    }
  }

  const bucket: BucketRow[] = [...bucketMap.entries()]
    .map(([bucketId, v]) => ({ bucketId, ...v }))
    .sort((a, b) => (a.hint < b.hint ? -1 : a.hint > b.hint ? 1 : 0))

  const workload: WorkloadRow[] = [...workloadMap.values()].sort((a, b) => b.total - a.total)

  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const weekOutMs = todayMs + 7 * 86_400_000
  const late = tasks
    .filter(
      (t) => t.dueDate && new Date(t.dueDate).getTime() < todayMs && t.progress !== 'completed',
    )
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
    .slice(0, 5)
  const upcoming = tasks
    .filter((t) => {
      if (!t.dueDate || t.progress === 'completed') return false
      const ms = new Date(t.dueDate).getTime()
      return ms >= todayMs && ms <= weekOutMs
    })
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
    .slice(0, 5)

  return { progress, priority, bucket, workload, lateUpcoming: { late, upcoming } }
}
```

- [ ] **Step 5: Run tests — expect pass.**

```bash
bun test apps/api/src/modules/planner/application/lib/charts-data.spec.ts
bun run --filter @future/api-client build
```

- [ ] **Step 6: Commit.**

```bash
git add packages/api-client/src/planner/ apps/api/src/modules/planner/application/lib/charts-data.ts apps/api/src/modules/planner/application/lib/charts-data.spec.ts
git commit -m "feat(planner): computePlannerChartsData server-side reducers + PlannerChartsData type"
```

---

## Task 6 — `GetPersonalChartsQuery` + handler

**Files:**

- Create: `apps/api/src/modules/planner/application/queries/personal/get-personal-charts.query.ts`
- Create: `apps/api/src/modules/planner/application/queries/personal/get-personal-charts.handler.ts`
- Create: `apps/api/src/modules/planner/application/queries/personal/get-personal-charts.handler.spec.ts`

- [ ] **Step 1: Write the failing spec.**

```ts
// get-personal-charts.handler.spec.ts
import { Test } from '@nestjs/testing'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { QueryBus } from '@nestjs/cqrs'
import { GetPersonalChartsHandler } from './get-personal-charts.handler'
import { GetPersonalChartsQuery } from './get-personal-charts.query'
import { ListTasksForActorQuery } from './list-tasks-for-actor.query'

describe('GetPersonalChartsHandler', () => {
  const actorId = 'a1'
  const tenantId = 't1'
  let handler: GetPersonalChartsHandler
  let queryBus: { execute: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    queryBus = { execute: vi.fn() }
    const mod = await Test.createTestingModule({
      providers: [GetPersonalChartsHandler, { provide: QueryBus, useValue: queryBus }],
    }).compile()
    handler = mod.get(GetPersonalChartsHandler)
  })

  it('delegates to ListTasksForActorQuery with includeCompleted=true (charts count done)', async () => {
    queryBus.execute.mockResolvedValue([])
    await handler.execute(new GetPersonalChartsQuery(actorId, tenantId))
    const called = queryBus.execute.mock.calls[0]![0] as ListTasksForActorQuery
    expect(called).toBeInstanceOf(ListTasksForActorQuery)
    expect(called.options.includeCompleted).toBe(true)
  })

  it('computes PlannerChartsData from the returned tasks', async () => {
    queryBus.execute.mockResolvedValue([
      {
        id: '1',
        planId: 'p1',
        planName: 'P',
        planKind: 'team',
        bucketId: 'b',
        bucketName: 'B',
        bucketOrderHint: '0|a:',
        title: 't',
        progress: 'in-progress',
        priority: 'urgent',
        startDate: null,
        dueDate: null,
        assignees: [],
        labels: [],
        orderHint: '0|a:',
        commentCount: 0,
        checklistCount: { total: 0, completed: 0 },
        attachmentCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ])
    const data = await handler.execute(new GetPersonalChartsQuery(actorId, tenantId))
    expect(data.progress['in-progress']).toBe(1)
    expect(data.priority.urgent).toBe(1)
  })
})
```

- [ ] **Step 2: Run — expect failure.**

```bash
bun test apps/api/src/modules/planner/application/queries/personal/get-personal-charts.handler.spec.ts
```

- [ ] **Step 3: Implement.**

```ts
// get-personal-charts.query.ts
export class GetPersonalChartsQuery {
  constructor(
    public readonly actorId: string,
    public readonly tenantId: string,
  ) {}
}
```

```ts
// get-personal-charts.handler.ts
import { QueryBus, QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import type { PlannerChartsData, TaskFlatWithPlan } from '@future/api-client/planner'
import { computePlannerChartsData } from '../../lib/charts-data'
import { ListTasksForActorQuery } from './list-tasks-for-actor.query'
import { GetPersonalChartsQuery } from './get-personal-charts.query'

@QueryHandler(GetPersonalChartsQuery)
export class GetPersonalChartsHandler implements IQueryHandler<
  GetPersonalChartsQuery,
  PlannerChartsData
> {
  constructor(private readonly queryBus: QueryBus) {}

  async execute(query: GetPersonalChartsQuery): Promise<PlannerChartsData> {
    const tasks = await this.queryBus.execute<ListTasksForActorQuery, TaskFlatWithPlan[]>(
      new ListTasksForActorQuery(query.actorId, query.tenantId, { includeCompleted: true }),
    )
    return computePlannerChartsData(tasks)
  }
}
```

- [ ] **Step 4: Register in `planner.module.ts`.**

Add `GetPersonalChartsHandler` to `providers`.

- [ ] **Step 5: Run tests — expect pass.**

- [ ] **Step 6: Commit.**

```bash
git add apps/api/src/modules/planner/application/queries/personal/get-personal-charts.* apps/api/src/modules/planner/planner.module.ts
git commit -m "feat(planner): GetPersonalCharts query + handler"
```

---

## Task 7 — tRPC procedures: `personal.listTasks` + `personal.getCharts`

**Files:**

- Modify: `apps/api/src/modules/planner/interface/trpc/personal.router.ts`
- Modify: `apps/api/src/modules/planner/interface/trpc/personal.router.integration.spec.ts`

- [ ] **Step 1: Extend the integration spec first.**

```ts
// personal.router.integration.spec.ts — add to the existing describe
describe('personal.listTasks', () => {
  it('returns TaskFlatWithPlan[] for the current actor', async () => {
    await h.seedTask({ planId: h.teamPlan.id, assigneeIds: [h.actor.id], title: 'Ship' })
    const caller = h.makeCaller({ actorId: h.actor.id, tenantId: h.tenant.id })
    const result = await caller.personal.listTasks({ includeCompleted: false })
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Ship', planName: expect.any(String), planKind: 'team' }),
      ]),
    )
  })

  it('validates includeCompleted (boolean)', async () => {
    const caller = h.makeCaller({ actorId: h.actor.id, tenantId: h.tenant.id })
    await expect(
      // @ts-expect-error — testing runtime validation
      caller.personal.listTasks({ includeCompleted: 'yes' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('rejects without planner:personal:read permission', async () => {
    const caller = h.makeCaller({
      actorId: h.actor.id,
      tenantId: h.tenant.id,
      permissions: new Set(),
    })
    await expect(caller.personal.listTasks({})).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})

describe('personal.getCharts', () => {
  it('returns PlannerChartsData aggregated across every plan the actor sees', async () => {
    await h.seedTask({ planId: h.teamPlan.id, assigneeIds: [h.actor.id], title: 'x', priority: 1 })
    const caller = h.makeCaller({ actorId: h.actor.id, tenantId: h.tenant.id })
    const data = await caller.personal.getCharts({})
    expect(data.priority.urgent).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 2: Run — expect failure.**

```bash
bun test apps/api/src/modules/planner/interface/trpc/personal.router.integration.spec.ts
```

- [ ] **Step 3: Extend `personal.router.ts`.**

```ts
// personal.router.ts — add to the existing router object
import { z } from 'zod'
import { PERMISSIONS } from '../../../../common/auth/permissions'
import { ListTasksForActorQuery } from '../../application/queries/personal/list-tasks-for-actor.query'
import { GetPersonalChartsQuery } from '../../application/queries/personal/get-personal-charts.query'

const listTasksInput = z.object({
  includeCompleted: z.boolean().default(false),
  // filter/groupBy/sort are purely client-side — the server returns the unfiltered set
  // and the React Query hook runs applyTaskFilter + sortTasks + groupTasks on the result.
  // We intentionally keep the server surface small to match the spec query-strategy section.
})

const getChartsInput = z.object({
  // filter reserved for future server-side filtering; the current implementation
  // aggregates every task the actor can see (charts feed off the full dataset).
})

export const personalRouter = router({
  // ... existing listPlans from Plan 3.2 ...

  listTasks: protectedProcedure.input(listTasksInput).query(async ({ ctx, input }) => {
    ctx.auth.requirePermission(PERMISSIONS.PLANNER_PERSONAL_READ)
    return ctx.queryBus.execute(
      new ListTasksForActorQuery(ctx.actorId, ctx.tenantId, {
        includeCompleted: input.includeCompleted,
      }),
    )
  }),

  getCharts: protectedProcedure.input(getChartsInput).query(async ({ ctx }) => {
    ctx.auth.requirePermission(PERMISSIONS.PLANNER_PERSONAL_READ)
    return ctx.queryBus.execute(new GetPersonalChartsQuery(ctx.actorId, ctx.tenantId))
  }),
})
```

- [ ] **Step 4: Run tests — expect pass.**

```bash
bun test apps/api/src/modules/planner/interface/trpc/personal.router.integration.spec.ts
```

- [ ] **Step 5: Commit.**

```bash
git add apps/api/src/modules/planner/interface/trpc/personal.router.ts apps/api/src/modules/planner/interface/trpc/personal.router.integration.spec.ts
git commit -m "feat(planner): personal.listTasks + personal.getCharts tRPC procedures"
```

---

## Task 8 — `view-state.ts`: allow `'plan'` as a GroupKey

**Files:**

- Modify: `apps/web-planner/src/lib/view-state.ts`
- Modify: `apps/web-planner/src/lib/view-state.spec.ts`

- [ ] **Step 1: Extend the failing test.**

```ts
// view-state.spec.ts — append
it('parses group=plan into ViewState.groupBy', () => {
  const state = parseViewStateFromSearch(new URLSearchParams('group=plan'))
  expect(state.groupBy).toBe('plan')
})

it('serializes groupBy=plan back into ?group=plan', () => {
  const s = serializeViewStateToSearch({
    ...DEFAULT_VIEW_STATE,
    groupBy: 'plan',
  })
  expect(s).toContain('group=plan')
})
```

- [ ] **Step 2: Run — expect failure.**

```bash
bun test apps/web-planner/src/lib/view-state.spec.ts
```

Expected: the parse test FAILs (currently `group === 'plan'` is explicitly rejected on line 101; see `!==` clause). The serialize test FAILs because the type union doesn't include `'plan'`.

- [ ] **Step 3: Add `'plan'` to `GROUP_KEYS` and drop the rejection clause.**

```ts
// view-state.ts
export const GROUP_KEYS = [
  'bucket',
  'progress',
  'due',
  'priority',
  'assignee',
  'label',
  'plan',
] as const
```

Then remove the `&& group !== 'plan'` guard in the `groupBy` parse branch. Parse becomes:

```ts
groupBy:
  (GROUP_KEYS as readonly string[]).includes(group ?? '')
    ? (group as GroupKey)
    : 'bucket',
```

- [ ] **Step 4: Run — expect pass.**

```bash
bun test apps/web-planner/src/lib/view-state.spec.ts
```

- [ ] **Step 5: Commit.**

```bash
git add apps/web-planner/src/lib/view-state.ts apps/web-planner/src/lib/view-state.spec.ts
git commit -m "feat(web-planner): add 'plan' GroupKey to view state"
```

---

## Task 9 — `task-group.ts`: `groupByPlan()`

**Files:**

- Modify: `apps/web-planner/src/lib/task-group.ts`
- Modify: `apps/web-planner/src/lib/task-group.spec.ts`

- [ ] **Step 1: Write failing tests.**

```ts
// task-group.spec.ts — append
import type { TaskFlatWithPlan } from '@future/api-client/planner'

it('groups tasks by plan — personal first, then teams alphabetically', () => {
  const tasks: TaskFlatWithPlan[] = [
    makeFlat({ id: 't1', planId: 'team-b', planName: 'Beta', planKind: 'team' }),
    makeFlat({ id: 't2', planId: 'team-a', planName: 'Alpha', planKind: 'team' }),
    makeFlat({ id: 't3', planId: 'personal', planName: 'Personal', planKind: 'personal' }),
  ]
  const groups = groupTasks(tasks, 'plan')
  expect(groups.map((g) => g.key)).toEqual(['personal', 'team-a', 'team-b'])
  expect(groups.map((g) => g.label)).toEqual(['Personal', 'Alpha', 'Beta'])
})

it('gracefully handles TaskFlat (no planName) — label falls back to planId', () => {
  const tasks = [{ ...makeFlat({ id: 't1', planId: 'p1' }), planName: undefined } as TaskFlat]
  const groups = groupTasks(tasks as TaskFlat[], 'plan')
  expect(groups).toHaveLength(1)
  expect(groups[0]!.label).toBe('p1')
})
```

Add a test helper `makeFlat(overrides)` alongside the existing tests if not already present.

- [ ] **Step 2: Run — expect failure.**

```bash
bun test apps/web-planner/src/lib/task-group.spec.ts
```

- [ ] **Step 3: Add the branch.**

```ts
// task-group.ts — extend switch
case 'plan':
  return groupByPlan(tasks)
```

```ts
// task-group.ts — new function
function groupByPlan(tasks: TaskFlat[]): TaskGroup[] {
  const byId = new Map<
    string,
    { name: string; kind: 'team' | 'personal' | 'unknown'; tasks: TaskFlat[] }
  >()
  for (const t of tasks) {
    const withPlan = t as TaskFlat & { planName?: string; planKind?: 'team' | 'personal' }
    const name = withPlan.planName ?? t.planId
    const kind = withPlan.planKind ?? 'unknown'
    const existing = byId.get(t.planId)
    if (existing) existing.tasks.push(t)
    else byId.set(t.planId, { name, kind, tasks: [t] })
  }
  return [...byId.entries()]
    .map(([key, v]) => ({ key, label: v.name, kind: v.kind, tasks: v.tasks }))
    .sort((a, b) => {
      if (a.kind === 'personal' && b.kind !== 'personal') return -1
      if (b.kind === 'personal' && a.kind !== 'personal') return 1
      return a.label.localeCompare(b.label)
    })
    .map(({ key, label, tasks }) => ({ key, label, tasks }))
}
```

- [ ] **Step 4: Run — expect pass.**

- [ ] **Step 5: Commit.**

```bash
git add apps/web-planner/src/lib/task-group.ts apps/web-planner/src/lib/task-group.spec.ts
git commit -m "feat(web-planner): task-group supports 'plan' (personal first, then alpha)"
```

---

## Task 10 — `task-filter.ts`: `includeCompleted` flag

**Files:**

- Modify: `apps/web-planner/src/lib/task-filter.ts`
- Modify: `apps/web-planner/src/lib/task-filter.spec.ts`

`applyTaskFilter` already ignores progress. We add a second-arg options bag so the caller can hide completed tasks client-side (for cases where the server returned them — e.g. the Charts page wants them, but the Board/Grid/Schedule pages want them hidden when the chip is off).

- [ ] **Step 1: Write failing tests.**

```ts
// task-filter.spec.ts — append
it('hides completed tasks when includeCompleted=false (default)', () => {
  const tasks = [
    makeFlat({ id: 'a', progress: 'in-progress' }),
    makeFlat({ id: 'b', progress: 'completed' }),
  ]
  expect(
    applyTaskFilter(tasks, emptyFilter(), { includeCompleted: false }).map((t) => t.id),
  ).toEqual(['a'])
})

it('keeps completed tasks when includeCompleted=true', () => {
  const tasks = [
    makeFlat({ id: 'a', progress: 'in-progress' }),
    makeFlat({ id: 'b', progress: 'completed' }),
  ]
  expect(
    applyTaskFilter(tasks, emptyFilter(), { includeCompleted: true })
      .map((t) => t.id)
      .sort(),
  ).toEqual(['a', 'b'])
})

it('defaults includeCompleted to true when the option is not passed (existing call sites)', () => {
  const tasks = [makeFlat({ id: 'a', progress: 'completed' })]
  expect(applyTaskFilter(tasks, emptyFilter()).map((t) => t.id)).toEqual(['a'])
})
```

- [ ] **Step 2: Run — expect failure.**

- [ ] **Step 3: Extend `applyTaskFilter`.**

```ts
// task-filter.ts
export interface ApplyFilterOptions {
  includeCompleted?: boolean // default true (backward compatible with existing plan-page callers)
}

export function applyTaskFilter(
  tasks: TaskFlat[],
  filter: ViewState['filter'],
  options: ApplyFilterOptions = {},
): TaskFlat[] {
  const includeCompleted = options.includeCompleted ?? true
  let out = tasks
  if (!includeCompleted) out = out.filter((t) => t.progress !== 'completed')
  // … existing filter logic unchanged below
  return out
}
```

- [ ] **Step 4: Run — expect pass.**

- [ ] **Step 5: Commit.**

```bash
git add apps/web-planner/src/lib/task-filter.ts apps/web-planner/src/lib/task-filter.spec.ts
git commit -m "feat(web-planner): applyTaskFilter accepts includeCompleted option"
```

---

## Task 11 — `<PersonalPlanBadge />` component

**Files:**

- Create: `apps/web-planner/src/components/personal-plan-badge.tsx`
- Create: `apps/web-planner/src/components/personal-plan-badge.spec.tsx`

- [ ] **Step 1: Write failing test.**

```tsx
// personal-plan-badge.spec.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PersonalPlanBadge } from './personal-plan-badge'

describe('PersonalPlanBadge', () => {
  it('renders plan name + folder icon for team plans', () => {
    render(<PersonalPlanBadge planName="Alpha" planKind="team" />)
    expect(screen.getByText('Alpha')).toBeInTheDocument()
  })

  it('renders plan name + user icon for personal plans', () => {
    render(<PersonalPlanBadge planName="Personal" planKind="personal" />)
    expect(screen.getByText('Personal')).toBeInTheDocument()
    expect(screen.getByLabelText(/personal plan/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run — expect failure.**

- [ ] **Step 3: Implement.**

```tsx
// personal-plan-badge.tsx
import { Folder, User } from 'lucide-react'
import { Badge } from '@future/ui'

export function PersonalPlanBadge({
  planName,
  planKind,
}: {
  planName: string
  planKind: 'team' | 'personal'
}) {
  const Icon = planKind === 'personal' ? User : Folder
  const label = planKind === 'personal' ? 'Personal plan' : 'Team plan'
  return (
    <Badge variant="secondary" className="gap-1" aria-label={label}>
      <Icon className="size-3" aria-hidden={true} />
      <span className="max-w-[10ch] truncate">{planName}</span>
    </Badge>
  )
}
```

- [ ] **Step 4: Run — expect pass.**

- [ ] **Step 5: Commit.**

```bash
git add apps/web-planner/src/components/personal-plan-badge.tsx apps/web-planner/src/components/personal-plan-badge.spec.tsx
git commit -m "feat(web-planner): PersonalPlanBadge component"
```

---

## Task 12 — Wire the badge into `TaskCard` (Board) and `BucketCell` (Grid)

**Files:**

- Modify: `apps/web-planner/src/components/board/TaskCard.tsx`
- Modify: `apps/web-planner/src/components/board/TaskCard.spec.tsx`
- Modify: `apps/web-planner/src/components/grid/cells/BucketCell.tsx`

The badge is a cross-plan signal: render **only when** `task.planName` is non-empty. On single-plan pages (`/plans/[id]/*`), the `TaskFlat` rows don't carry `planName`, so the badge stays hidden — no extra prop drilling.

- [ ] **Step 1: Extend `TaskCard` test.**

```tsx
// TaskCard.spec.tsx — append
it('renders the PersonalPlanBadge when task.planName is present', () => {
  render(
    <TaskCard
      task={{ ...makeBoardTask(), planName: 'Alpha', planKind: 'team' } as any}
      {...baseProps}
    />,
  )
  expect(screen.getByText('Alpha')).toBeInTheDocument()
})

it('does NOT render a badge when planName is absent (single-plan page)', () => {
  render(<TaskCard task={makeBoardTask()} {...baseProps} />)
  expect(screen.queryByLabelText(/team plan|personal plan/i)).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run — expect failure.**

- [ ] **Step 3: Render the badge in `TaskCard`.**

Find the JSX header row (above the title or next to the priority/progress icons, whichever matches DESIGN.md's card layout). Insert:

```tsx
{
  'planName' in task && task.planName ? (
    <PersonalPlanBadge
      planName={task.planName as string}
      planKind={(task as { planKind?: 'team' | 'personal' }).planKind ?? 'team'}
    />
  ) : null
}
```

Import: `import { PersonalPlanBadge } from '../personal-plan-badge'`.

- [ ] **Step 4: Extend `BucketCell`.**

```tsx
// grid/cells/BucketCell.tsx
import { PersonalPlanBadge } from '../../personal-plan-badge'

export function BucketCell({ task }: { task: TaskFlat }) {
  const withPlan = task as TaskFlat & { planName?: string; planKind?: 'team' | 'personal' }
  return (
    <div className="flex items-center gap-2">
      <span className="truncate">{task.bucketName}</span>
      {withPlan.planName ? (
        <PersonalPlanBadge planName={withPlan.planName} planKind={withPlan.planKind ?? 'team'} />
      ) : null}
    </div>
  )
}
```

- [ ] **Step 5: Run — expect pass.**

```bash
bun test apps/web-planner/src/components/board/TaskCard.spec.tsx
bun test apps/web-planner/src/components/grid/
```

- [ ] **Step 6: Commit.**

```bash
git add apps/web-planner/src/components/board/TaskCard.tsx apps/web-planner/src/components/board/TaskCard.spec.tsx apps/web-planner/src/components/grid/cells/BucketCell.tsx
git commit -m "feat(web-planner): surface PersonalPlanBadge on Board/Grid when cross-plan"
```

---

## Task 13 — `IncludeCompletedChip` + FilterBar personal mode

**Files:**

- Modify: `apps/web-planner/src/components/filter-bar/types.ts`
- Create: `apps/web-planner/src/components/filter-bar/filters/IncludeCompletedChip.tsx`
- Create: `apps/web-planner/src/components/filter-bar/filters/IncludeCompletedChip.spec.tsx`
- Modify: `apps/web-planner/src/components/filter-bar/FilterBar.tsx`

FilterBar today is bound to `useViewState({ planId })`. On personal pages there is no `planId`. We flip the binding key — `useViewState({ scope: 'personal' })` (already supported by the 3.2 layout, but verify in `useViewState`) — and pass a `mode` prop so FilterBar knows when to surface `IncludeCompletedChip`.

- [ ] **Step 1: Update the types.**

```ts
// components/filter-bar/types.ts
export type FilterMode = 'plan' | 'personal'

export interface PlanContext {
  labels: { id: string; name: string; color: string }[]
  members: { actorId: string; displayName: string }[]
  buckets: { id: string; name: string; orderHint: string }[]
}

export type FilterField =
  | 'due'
  | 'priority'
  | 'labels'
  | 'buckets'
  | 'assignees'
  | 'includeCompleted'
```

- [ ] **Step 2: Write the chip spec.**

```tsx
// IncludeCompletedChip.spec.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { IncludeCompletedChip } from './IncludeCompletedChip'

describe('IncludeCompletedChip', () => {
  it('shows "Hide completed" when off', () => {
    render(<IncludeCompletedChip value={false} onChange={vi.fn()} />)
    expect(screen.getByText(/hide completed/i)).toBeInTheDocument()
  })

  it('shows "Show completed" when on', () => {
    render(<IncludeCompletedChip value={true} onChange={vi.fn()} />)
    expect(screen.getByText(/show completed/i)).toBeInTheDocument()
  })

  it('invokes onChange with toggled value', () => {
    const onChange = vi.fn()
    render(<IncludeCompletedChip value={false} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onChange).toHaveBeenCalledWith(true)
  })
})
```

- [ ] **Step 3: Implement.**

```tsx
// IncludeCompletedChip.tsx
import { Check, EyeOff } from 'lucide-react'
import { Button } from '@future/ui'

export function IncludeCompletedChip({
  value,
  onChange,
}: {
  value: boolean
  onChange: (next: boolean) => void
}) {
  const Icon = value ? Check : EyeOff
  const label = value ? 'Show completed' : 'Hide completed'
  return (
    <Button variant={value ? 'default' : 'ghost'} size="sm" onClick={() => onChange(!value)}>
      <Icon className="size-4" aria-hidden={true} />
      {label}
    </Button>
  )
}
```

- [ ] **Step 4: Wire into `FilterBar`.**

```tsx
// FilterBar.tsx — add props
export function FilterBar({
  planId,
  context,
  mode = 'plan',
  includeCompleted,
  onIncludeCompletedChange,
}: {
  planId?: string
  context: PlanContext
  mode?: FilterMode
  includeCompleted?: boolean
  onIncludeCompletedChange?: (next: boolean) => void
}) {
  // ... existing state ...
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* existing chips render */}
      {mode === 'personal' && onIncludeCompletedChange ? (
        <IncludeCompletedChip
          value={includeCompleted ?? false}
          onChange={onIncludeCompletedChange}
        />
      ) : null}
    </div>
  )
}
```

Import: `import { IncludeCompletedChip } from './filters/IncludeCompletedChip'`.

- [ ] **Step 5: Run — expect pass.**

```bash
bun test apps/web-planner/src/components/filter-bar/
```

- [ ] **Step 6: Commit.**

```bash
git add apps/web-planner/src/components/filter-bar/
git commit -m "feat(web-planner): IncludeCompletedChip + FilterBar personal mode"
```

---

## Task 14 — `GroupByPicker` accepts `availableKeys`

**Files:**

- Modify: `apps/web-planner/src/components/group-by/GroupByPicker.tsx`
- Modify: `apps/web-planner/src/components/group-by/GroupByPicker.spec.tsx`

- [ ] **Step 1: Update the test.**

```tsx
// GroupByPicker.spec.tsx — append
it('renders only the supplied keys when availableKeys is provided', () => {
  render(<GroupByPicker availableKeys={['plan', 'progress', 'due']} />)
  fireEvent.click(screen.getByRole('button'))
  expect(screen.getByText('Plan')).toBeInTheDocument()
  expect(screen.getByText('Progress')).toBeInTheDocument()
  expect(screen.queryByText('Bucket')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Extend `GroupByPicker`.**

```tsx
// GroupByPicker.tsx
const ALL_GROUPS: { key: GroupKey; label: string }[] = [
  { key: 'bucket', label: 'Bucket' },
  { key: 'plan', label: 'Plan' },
  { key: 'progress', label: 'Progress' },
  { key: 'due', label: 'Due date' },
  { key: 'priority', label: 'Priority' },
  { key: 'assignee', label: 'Assignee' },
  { key: 'label', label: 'Label' },
]

export function GroupByPicker({
  planId,
  availableKeys,
}: {
  planId?: string
  availableKeys?: GroupKey[]
}) {
  const { state, patch } = useViewState({ planId })
  const keys = availableKeys ?? ALL_GROUPS.map((g) => g.key).filter((k) => k !== 'plan')
  const options = ALL_GROUPS.filter((g) => keys.includes(g.key))
  // ... dropdown render unchanged, iterate over options ...
}
```

Default (`availableKeys` omitted) excludes `'plan'` so existing per-plan pages don't get a new option they don't need. Personal pages pass it explicitly.

- [ ] **Step 3: Run — expect pass.**

- [ ] **Step 4: Commit.**

```bash
git add apps/web-planner/src/components/group-by/
git commit -m "feat(web-planner): GroupByPicker supports availableKeys filter"
```

---

## Task 15 — `usePersonalTasks` hook

**Files:**

- Create: `apps/web-planner/src/lib/hooks/use-personal-tasks.ts`
- Create: `apps/web-planner/src/lib/hooks/use-personal-tasks.spec.ts`

- [ ] **Step 1: Failing spec.**

```ts
// use-personal-tasks.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { usePersonalTasks } from './use-personal-tasks'
import { trpc } from '../trpc'

vi.mock('@future/auth', () => ({
  useSession: () => ({ actorId: 'a1', tenantId: 't1' }),
}))

function wrap(qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

describe('usePersonalTasks', () => {
  beforeEach(() => {
    vi.spyOn(trpc.planner.personal.listTasks, 'query').mockResolvedValue([
      {
        id: '1',
        planId: 'p',
        planName: 'P',
        planKind: 'team',
        bucketId: 'b',
        bucketName: 'B',
        bucketOrderHint: '0|a:',
        title: 't',
        progress: 'in-progress',
        priority: 'medium',
        startDate: null,
        dueDate: null,
        assignees: [],
        labels: [],
        orderHint: '0|a:',
        commentCount: 0,
        checklistCount: { total: 0, completed: 0 },
        attachmentCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ] as any)
  })

  it('fetches and returns filtered, sorted, grouped rows', async () => {
    const { result } = renderHook(() => usePersonalTasks({ includeCompleted: false }), { wrapper: wrap() })
    await waitFor(() => expect(result.current.processed).toBeDefined())
    expect(result.current.processed!.rows).toHaveLength(1)
    expect(result.current.processed!.groups.length).toBeGreaterThan(0)
  })

  it('forwards includeCompleted to tRPC', async () => {
    renderHook(() => usePersonalTasks({ includeCompleted: true }), { wrapper: wrap() })
    await waitFor(() =>
      expect(trpc.planner.personal.listTasks.query).toHaveBeenCalledWith({ includeCompleted: true }),
    )
  })
})
```

- [ ] **Step 2: Run — expect failure.**

- [ ] **Step 3: Implement.**

```ts
// use-personal-tasks.ts
'use client'
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSession } from '@future/auth'
import type { TaskFlatWithPlan } from '@future/api-client/planner'
import type { TaskGroup } from '../task-group'
import { trpc } from '../trpc'
import { applyTaskFilter } from '../task-filter'
import { sortTasks } from '../task-sort'
import { groupTasks } from '../task-group'
import { useViewState } from './useViewState'

export interface UsePersonalTasksInput {
  includeCompleted: boolean
}

export interface UsePersonalTasksResult {
  data: TaskFlatWithPlan[] | undefined
  isLoading: boolean
  error: Error | null
  refetch: () => void
  processed: { rows: TaskFlatWithPlan[]; groups: TaskGroup[] } | undefined
}

export function usePersonalTasks({
  includeCompleted,
}: UsePersonalTasksInput): UsePersonalTasksResult {
  const session = useSession()
  const actorId = session?.actorId ?? ''
  const tenantId = session?.tenantId ?? ''

  const query = useQuery({
    queryKey: ['personal.listTasks', actorId, tenantId, includeCompleted] as const,
    queryFn: () =>
      trpc.planner.personal.listTasks.query({ includeCompleted }) as Promise<TaskFlatWithPlan[]>,
    enabled: Boolean(actorId && tenantId),
    staleTime: 5_000,
  })

  const { state } = useViewState({ scope: 'personal' })

  const processed = useMemo(() => {
    if (!query.data) return undefined
    const filtered = applyTaskFilter(query.data, state.filter, { includeCompleted })
    const sorted = state.sort ? sortTasks(filtered, state.sort) : filtered
    return { rows: sorted as TaskFlatWithPlan[], groups: groupTasks(sorted, state.groupBy) }
  }, [query.data, state.filter, state.sort, state.groupBy, includeCompleted])

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    processed,
  }
}
```

- [ ] **Step 4: Run — expect pass.**

- [ ] **Step 5: Commit.**

```bash
git add apps/web-planner/src/lib/hooks/use-personal-tasks.ts apps/web-planner/src/lib/hooks/use-personal-tasks.spec.ts
git commit -m "feat(web-planner): usePersonalTasks React Query hook"
```

---

## Task 16 — `usePersonalCharts` hook

**Files:**

- Create: `apps/web-planner/src/lib/hooks/use-personal-charts.ts`
- Create: `apps/web-planner/src/lib/hooks/use-personal-charts.spec.ts`

- [ ] **Step 1: Failing spec.**

```ts
// use-personal-charts.spec.ts
import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { usePersonalCharts } from './use-personal-charts'
import { trpc } from '../trpc'

vi.mock('@future/auth', () => ({
  useSession: () => ({ actorId: 'a1', tenantId: 't1' }),
}))

describe('usePersonalCharts', () => {
  it('returns PlannerChartsData from personal.getCharts', async () => {
    const payload = {
      progress: { 'not-started': 0, 'in-progress': 1, completed: 0 },
      priority: { urgent: 1, important: 0, medium: 0, low: 0 },
      bucket: [],
      workload: [],
      lateUpcoming: { late: [], upcoming: [] },
    }
    vi.spyOn(trpc.planner.personal.getCharts, 'query').mockResolvedValue(payload as any)

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result } = renderHook(() => usePersonalCharts(), {
      wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
    })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data!.progress['in-progress']).toBe(1)
  })
})
```

- [ ] **Step 2: Run — expect failure.**

- [ ] **Step 3: Implement.**

```ts
// use-personal-charts.ts
'use client'
import { useQuery } from '@tanstack/react-query'
import { useSession } from '@future/auth'
import type { PlannerChartsData } from '@future/api-client/planner'
import { trpc } from '../trpc'

export interface UsePersonalChartsResult {
  data: PlannerChartsData | undefined
  isLoading: boolean
  error: Error | null
}

export function usePersonalCharts(): UsePersonalChartsResult {
  const session = useSession()
  const actorId = session?.actorId ?? ''
  const tenantId = session?.tenantId ?? ''

  const query = useQuery({
    queryKey: ['personal.getCharts', actorId, tenantId] as const,
    queryFn: () => trpc.planner.personal.getCharts.query({}) as Promise<PlannerChartsData>,
    enabled: Boolean(actorId && tenantId),
    staleTime: 30_000,
  })

  return { data: query.data, isLoading: query.isLoading, error: query.error }
}
```

- [ ] **Step 4: Run — expect pass.**

- [ ] **Step 5: Commit.**

```bash
git add apps/web-planner/src/lib/hooks/use-personal-charts.ts apps/web-planner/src/lib/hooks/use-personal-charts.spec.ts
git commit -m "feat(web-planner): usePersonalCharts React Query hook"
```

---

## Task 17 — `/personal/tasks/layout.tsx` (view picker + filter bar + group-by)

**Files:**

- Create: `apps/web-planner/src/app/personal/tasks/layout.tsx`
- Create: `apps/web-planner/src/app/personal/tasks/layout.spec.tsx`

- [ ] **Step 1: Failing spec.**

```tsx
// layout.spec.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import PersonalTasksLayout from './layout'

vi.mock('next/navigation', () => ({
  usePathname: () => '/personal/tasks/board',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))
vi.mock('@future/auth', () => ({ useSession: () => ({ actorId: 'a', tenantId: 't' }) }))

describe('PersonalTasksLayout', () => {
  it('renders My Tasks breadcrumb + view picker + include-completed chip', () => {
    render(
      <PersonalTasksLayout>
        <div>child</div>
      </PersonalTasksLayout>,
    )
    expect(screen.getByText(/my tasks/i)).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /board/i })).toBeInTheDocument()
    expect(screen.getByText(/hide completed|show completed/i)).toBeInTheDocument()
    expect(screen.getByText('child')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run — expect failure.**

- [ ] **Step 3: Implement.**

```tsx
// layout.tsx
'use client'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbPage } from '@future/ui'
import { ViewPicker } from '@/components/view-picker/ViewPicker'
import { FilterBar } from '@/components/filter-bar/FilterBar'
import { GroupByPicker } from '@/components/group-by/GroupByPicker'
import type { ViewKey, GroupKey } from '@/lib/view-state'
import type { PlanContext } from '@/components/filter-bar/types'

const EMPTY_CONTEXT: PlanContext = { labels: [], members: [], buckets: [] }
const PERSONAL_GROUP_KEYS: GroupKey[] = ['plan', 'progress', 'due', 'priority', 'assignee', 'label']

export default function PersonalTasksLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [includeCompleted, setIncludeCompleted] = useState(false)

  const segment = pathname.split('/')[3] ?? 'board'
  const currentView: ViewKey = (['board', 'grid', 'schedule', 'charts'] as const).includes(
    segment as ViewKey,
  )
    ? (segment as ViewKey)
    : 'board'

  // Cross-plan scope → no planId. ViewPicker accepts an optional scope prop.
  return (
    <div className="flex flex-col min-h-0">
      <header className="border-b border-overlay/5 bg-panel">
        <div className="flex items-center gap-1 px-6 py-2">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>My Tasks</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        <div className="flex items-center justify-between gap-4 px-6 py-2">
          <ViewPicker scope="personal" currentView={currentView} basePath="/personal/tasks" />
          <div className="flex items-center gap-3">
            <FilterBar
              context={EMPTY_CONTEXT}
              mode="personal"
              includeCompleted={includeCompleted}
              onIncludeCompletedChange={setIncludeCompleted}
            />
            <GroupByPicker availableKeys={PERSONAL_GROUP_KEYS} />
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0">{children}</div>
    </div>
  )
}
```

> **ViewPicker change required:** if the existing `ViewPicker` takes a `planId` positional, add an overload that accepts `{ scope: 'personal', basePath }` and derives hrefs as `${basePath}/{view}`. Keep the existing `planId`-flavored call sites intact. Add a one-line test to `ViewPicker.spec.tsx` covering the personal path. This is a ~5 line delta, tracked inside this task.

- [ ] **Step 4: Bridge the `includeCompleted` state to child pages via React context.**

Wrap `children` in a simple context provider:

```tsx
// apps/web-planner/src/app/personal/tasks/personal-tasks-context.ts
'use client'
import { createContext, useContext } from 'react'
export const PersonalTasksContext = createContext<{ includeCompleted: boolean }>({
  includeCompleted: false,
})
export const usePersonalTasksCtx = () => useContext(PersonalTasksContext)
```

In the layout, wrap: `<PersonalTasksContext.Provider value={{ includeCompleted }}>{children}</PersonalTasksContext.Provider>`.

- [ ] **Step 5: Run — expect pass.**

- [ ] **Step 6: Commit.**

```bash
git add apps/web-planner/src/app/personal/tasks/layout.tsx apps/web-planner/src/app/personal/tasks/layout.spec.tsx apps/web-planner/src/app/personal/tasks/personal-tasks-context.ts apps/web-planner/src/components/view-picker/
git commit -m "feat(web-planner): /personal/tasks layout with view picker + filter bar"
```

---

## Task 18 — `/personal/tasks/board/page.tsx`

**Files:**

- Create: `apps/web-planner/src/app/personal/tasks/board/page.tsx`
- Create: `apps/web-planner/src/app/personal/tasks/board/page.spec.tsx`

- [ ] **Step 1: Failing spec.**

```tsx
// board/page.spec.tsx
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi } from 'vitest'
import BoardPage from './page'
import { trpc } from '@/lib/trpc'

vi.mock('@future/auth', () => ({ useSession: () => ({ actorId: 'a', tenantId: 't' }) }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/personal/tasks/board',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))

const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })

describe('Personal tasks / board', () => {
  it('shows the empty state when nothing is returned', async () => {
    vi.spyOn(trpc.planner.personal.listTasks, 'query').mockResolvedValue([])
    render(
      <QueryClientProvider client={qc()}>
        <BoardPage />
      </QueryClientProvider>,
    )
    await waitFor(() =>
      expect(screen.getByText(/nothing assigned to you yet/i)).toBeInTheDocument(),
    )
  })

  it('renders tasks grouped by the current groupBy', async () => {
    vi.spyOn(trpc.planner.personal.listTasks, 'query').mockResolvedValue([
      {
        id: '1',
        planId: 'p1',
        planName: 'Alpha',
        planKind: 'team',
        bucketId: 'b1',
        bucketName: 'Todo',
        bucketOrderHint: '0|a:',
        title: 'x',
        progress: 'in-progress',
        priority: 'medium',
        startDate: null,
        dueDate: null,
        assignees: [],
        labels: [],
        orderHint: '0|a:',
        commentCount: 0,
        attachmentCount: 0,
        checklistCount: { total: 0, completed: 0 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ] as any)
    render(
      <QueryClientProvider client={qc()}>
        <BoardPage />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByText('x')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run — expect failure.**

- [ ] **Step 3: Implement.**

```tsx
// board/page.tsx
'use client'
import { Alert, AlertDescription, Skeleton } from '@future/ui'
import { usePersonalTasks } from '@/lib/hooks/use-personal-tasks'
import { usePersonalTasksCtx } from '../personal-tasks-context'
import { BoardColumn } from '@/components/board/BoardColumn'

export default function PersonalBoardPage() {
  const { includeCompleted } = usePersonalTasksCtx()
  const { processed, isLoading, error } = usePersonalTasks({ includeCompleted })

  if (isLoading) {
    return (
      <div className="flex gap-4 p-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-96 w-72" />
        ))}
      </div>
    )
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Failed to load tasks.</AlertDescription>
      </Alert>
    )
  }
  const groups = processed?.groups ?? []
  if (groups.length === 0 || groups.every((g) => g.tasks.length === 0)) {
    return (
      <Alert>
        <AlertDescription>
          Nothing assigned to you yet. Tasks from plans you're a member of show up here
          automatically.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="flex gap-4 overflow-x-auto p-4">
      {groups.map((g) => (
        <BoardColumn
          key={g.key}
          groupKey={g.key}
          label={g.label}
          tasks={g.tasks as any /* TaskFlatWithPlan is TaskFlat-compatible */}
          // Cross-plan mode: no DnD (reordering across plans is out of scope for 3.3)
          readOnly={true}
        />
      ))}
    </div>
  )
}
```

> **BoardColumn `readOnly` prop:** the Board column component from Sub-project #2 accepts (or will be extended to accept) a `readOnly` flag that disables DnD, add-task-at-end, and other mutations that presuppose a single plan context. Extend the spec when missing — test: "readOnly Board column does not render QuickAddTask."

- [ ] **Step 4: Run — expect pass.**

- [ ] **Step 5: Commit.**

```bash
git add apps/web-planner/src/app/personal/tasks/board/ apps/web-planner/src/components/board/BoardColumn.tsx apps/web-planner/src/components/board/BoardColumn.spec.tsx
git commit -m "feat(web-planner): /personal/tasks/board route (read-only cross-plan board)"
```

---

## Task 19 — `/personal/tasks/grid/page.tsx`

**Files:**

- Create: `apps/web-planner/src/app/personal/tasks/grid/page.tsx`
- Create: `apps/web-planner/src/app/personal/tasks/grid/page.spec.tsx`

- [ ] **Step 1: Failing spec.**

```tsx
// grid/page.spec.tsx
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi } from 'vitest'
import GridPage from './page'
import { trpc } from '@/lib/trpc'

vi.mock('@future/auth', () => ({ useSession: () => ({ actorId: 'a', tenantId: 't' }) }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/personal/tasks/grid',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
}))

describe('Personal tasks / grid', () => {
  it('renders a grid row with the plan badge', async () => {
    vi.spyOn(trpc.planner.personal.listTasks, 'query').mockResolvedValue([
      {
        id: '1',
        planId: 'p1',
        planName: 'Alpha',
        planKind: 'team',
        bucketId: 'b',
        bucketName: 'Todo',
        bucketOrderHint: '0|a:',
        title: 'Write plan',
        progress: 'in-progress',
        priority: 'urgent',
        startDate: null,
        dueDate: null,
        assignees: [],
        labels: [],
        orderHint: '0|a:',
        commentCount: 0,
        attachmentCount: 0,
        checklistCount: { total: 0, completed: 0 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ] as any)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <GridPage />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByText('Write plan')).toBeInTheDocument())
    expect(screen.getByText('Alpha')).toBeInTheDocument() // PersonalPlanBadge
  })
})
```

- [ ] **Step 2: Run — expect failure.**

- [ ] **Step 3: Implement.**

```tsx
// grid/page.tsx
'use client'
import { Alert, AlertDescription, Skeleton } from '@future/ui'
import { TaskGrid } from '@/components/grid/TaskGrid'
import { usePersonalTasks } from '@/lib/hooks/use-personal-tasks'
import { usePersonalTasksCtx } from '../personal-tasks-context'

export default function PersonalGridPage() {
  const { includeCompleted } = usePersonalTasksCtx()
  const { processed, isLoading, error } = usePersonalTasks({ includeCompleted })

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 p-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Failed to load tasks.</AlertDescription>
      </Alert>
    )
  }

  const rows = processed?.rows ?? []
  if (rows.length === 0) {
    return (
      <Alert>
        <AlertDescription>
          Nothing assigned to you yet. Tasks from plans you're a member of show up here
          automatically.
        </AlertDescription>
      </Alert>
    )
  }

  // TaskGrid expects TaskFlat[]. TaskFlatWithPlan is structurally compatible
  // and the BucketCell looks for task.planName at runtime.
  return (
    <TaskGrid
      planId={null}
      data={rows}
      groups={processed?.groups}
      context={{ members: [], labels: [] }}
      readOnly={true}
    />
  )
}
```

> **TaskGrid `readOnly` + `planId: null`:** TaskGrid needs a null-tolerant planId (no per-plan mutations wired when planId is null) and a `readOnly` prop that hides the inline-edit entry points. Extend in the same commit. Add a test covering "readOnly Grid disables inline-edit cells."

- [ ] **Step 4: Run — expect pass.**

- [ ] **Step 5: Commit.**

```bash
git add apps/web-planner/src/app/personal/tasks/grid/ apps/web-planner/src/components/grid/
git commit -m "feat(web-planner): /personal/tasks/grid route (read-only, plan badges)"
```

---

## Task 20 — `/personal/tasks/schedule/page.tsx`

**Files:**

- Create: `apps/web-planner/src/app/personal/tasks/schedule/page.tsx`
- Create: `apps/web-planner/src/app/personal/tasks/schedule/page.spec.tsx`

Schedule shows the personal-cross-plan task set on a calendar. Mutations (drag-to-reschedule) are disabled here in 3.3 — we surface a read-only calendar. Making schedule write-enabled across plans is spec-deferred (consistency guarantees are plan-local in the existing handler).

- [ ] **Step 1: Failing spec.**

```tsx
// schedule/page.spec.tsx
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi } from 'vitest'
import SchedulePage from './page'
import { trpc } from '@/lib/trpc'

vi.mock('@future/auth', () => ({ useSession: () => ({ actorId: 'a', tenantId: 't' }) }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/personal/tasks/schedule',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
}))
vi.mock('@future/schedule', () => ({
  ScheduleCalendar: ({ items }: { items: unknown[] }) => (
    <div data-testid="cal">items: {items.length}</div>
  ),
}))

describe('Personal tasks / schedule', () => {
  it('passes the filtered task set to ScheduleCalendar', async () => {
    vi.spyOn(trpc.planner.personal.listTasks, 'query').mockResolvedValue([
      {
        id: '1',
        planId: 'p',
        planName: 'P',
        planKind: 'team',
        bucketId: 'b',
        bucketName: 'T',
        bucketOrderHint: '0|a:',
        title: 't',
        progress: 'in-progress',
        priority: 'medium',
        startDate: new Date().toISOString(),
        dueDate: new Date().toISOString(),
        assignees: [],
        labels: [],
        orderHint: '0|a:',
        commentCount: 0,
        attachmentCount: 0,
        checklistCount: { total: 0, completed: 0 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ] as any)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <SchedulePage />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('cal')).toHaveTextContent('items: 1'))
  })
})
```

- [ ] **Step 2: Run — expect failure.**

- [ ] **Step 3: Implement.**

```tsx
// schedule/page.tsx
'use client'
import { ScheduleCalendar } from '@future/schedule'
import type { ScheduleView } from '@future/schedule'
import '@future/schedule/styles.css'
import { Alert, AlertDescription, Skeleton } from '@future/ui'
import { useMemo } from 'react'
import { usePersonalTasks } from '@/lib/hooks/use-personal-tasks'
import { usePersonalTasksCtx } from '../personal-tasks-context'
import { useViewState } from '@/lib/hooks/useViewState'

export default function PersonalSchedulePage() {
  const { includeCompleted } = usePersonalTasksCtx()
  const { processed, isLoading, error } = usePersonalTasks({ includeCompleted })
  const { state, patch } = useViewState({ scope: 'personal' })

  const view: ScheduleView = state.scale === 'month' ? 'dayGridMonth' : 'dayGridWeek'

  const items = useMemo(
    () =>
      (processed?.rows ?? [])
        .filter((t) => t.startDate || t.dueDate)
        .map((t) => ({
          id: t.id,
          title: t.title,
          start: t.startDate ?? t.dueDate!,
          end: t.dueDate ?? t.startDate!,
          meta: { planName: t.planName, planKind: t.planKind },
        })),
    [processed?.rows],
  )

  if (isLoading) return <Skeleton className="h-96 w-full" />
  if (error)
    return (
      <Alert variant="destructive">
        <AlertDescription>Failed to load tasks.</AlertDescription>
      </Alert>
    )
  if (items.length === 0) {
    return (
      <Alert>
        <AlertDescription>
          No dated tasks to schedule. Set a start or due date on a task to see it here.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="flex flex-1 min-h-0">
      <ScheduleCalendar
        items={items}
        view={view}
        onViewChange={(v) => patch({ scale: v === 'dayGridMonth' ? 'month' : 'week' })}
        onChange={undefined /* read-only in 3.3 */}
        availableViews={['dayGridWeek', 'dayGridMonth']}
      />
    </div>
  )
}
```

- [ ] **Step 4: Run — expect pass.**

- [ ] **Step 5: Commit.**

```bash
git add apps/web-planner/src/app/personal/tasks/schedule/
git commit -m "feat(web-planner): /personal/tasks/schedule route (read-only)"
```

---

## Task 21 — `/personal/tasks/charts/page.tsx`

**Files:**

- Create: `apps/web-planner/src/app/personal/tasks/charts/page.tsx`
- Create: `apps/web-planner/src/app/personal/tasks/charts/page.spec.tsx`

- [ ] **Step 1: Failing spec.**

```tsx
// charts/page.spec.tsx
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi } from 'vitest'
import ChartsPage from './page'
import { trpc } from '@/lib/trpc'

vi.mock('@future/auth', () => ({ useSession: () => ({ actorId: 'a', tenantId: 't' }) }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/personal/tasks/charts',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

describe('Personal tasks / charts', () => {
  it('renders chart panels when getCharts returns data', async () => {
    vi.spyOn(trpc.planner.personal.getCharts, 'query').mockResolvedValue({
      progress: { 'not-started': 1, 'in-progress': 2, completed: 3 },
      priority: { urgent: 1, important: 1, medium: 2, low: 2 },
      bucket: [{ bucketId: 'b', bucketName: 'B', count: 2, hint: '0|a:' }],
      workload: [],
      lateUpcoming: { late: [], upcoming: [] },
    } as any)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <ChartsPage />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByText(/progress/i)).toBeInTheDocument())
  })

  it('renders an empty-state when every panel is zero', async () => {
    vi.spyOn(trpc.planner.personal.getCharts, 'query').mockResolvedValue({
      progress: { 'not-started': 0, 'in-progress': 0, completed: 0 },
      priority: { urgent: 0, important: 0, medium: 0, low: 0 },
      bucket: [],
      workload: [],
      lateUpcoming: { late: [], upcoming: [] },
    } as any)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <ChartsPage />
      </QueryClientProvider>,
    )
    await waitFor(() =>
      expect(screen.getByText(/nothing assigned to you yet/i)).toBeInTheDocument(),
    )
  })
})
```

- [ ] **Step 2: Run — expect failure.**

- [ ] **Step 3: Implement.**

```tsx
// charts/page.tsx
'use client'
import { Alert, AlertDescription, Skeleton } from '@future/ui'
import { usePersonalCharts } from '@/lib/hooks/use-personal-charts'
import { ProgressDonut } from '@/components/charts/panels/ProgressDonut'
import { PriorityBar } from '@/components/charts/panels/PriorityBar'
import { BucketBar } from '@/components/charts/panels/BucketBar'
import { WorkloadByAssignee } from '@/components/charts/panels/WorkloadByAssignee'
import { LateUpcomingList } from '@/components/charts/panels/LateUpcomingList'

function isAllZero(d: NonNullable<ReturnType<typeof usePersonalCharts>['data']>): boolean {
  const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0)
  return (
    sum(d.progress) === 0 &&
    sum(d.priority) === 0 &&
    d.bucket.length === 0 &&
    d.workload.length === 0 &&
    d.lateUpcoming.late.length === 0 &&
    d.lateUpcoming.upcoming.length === 0
  )
}

export default function PersonalChartsPage() {
  const { data, isLoading, error } = usePersonalCharts()

  if (isLoading) {
    return (
      <div className="grid gap-4 p-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-64 w-full rounded-lg" />
        ))}
      </div>
    )
  }
  if (error || !data) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Failed to load charts.</AlertDescription>
      </Alert>
    )
  }
  if (isAllZero(data)) {
    return (
      <Alert>
        <AlertDescription>
          Nothing assigned to you yet. Tasks from plans you're a member of show up here
          automatically.
        </AlertDescription>
      </Alert>
    )
  }

  const noop = () => {}
  // Drill-through to a per-plan Grid is ambiguous cross-plan — disable drill here.
  return (
    <div className="grid gap-4 p-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      <ProgressDonut counts={data.progress} onDrill={noop} />
      <PriorityBar counts={data.priority} onDrill={noop} />
      <BucketBar data={data.bucket} onDrill={noop} />
      <WorkloadByAssignee rows={data.workload} onDrill={noop} />
      <div className="lg:col-span-2">
        <LateUpcomingList
          tasks={[...data.lateUpcoming.late, ...data.lateUpcoming.upcoming]}
          onOpen={noop}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run — expect pass.**

- [ ] **Step 5: Commit.**

```bash
git add apps/web-planner/src/app/personal/tasks/charts/
git commit -m "feat(web-planner): /personal/tasks/charts route backed by personal.getCharts"
```

---

## Task 22 — Full-suite verification

- [ ] **Step 1: Build all workspace packages.**

```bash
bun run --filter "@future/*" build
```

- [ ] **Step 2: Run the planner module's unit + integration suites.**

```bash
bun test apps/api/src/modules/planner
```

Expected: green. If the coverage report dips below 70%, add targeted tests — do not land below threshold.

- [ ] **Step 3: Run the web-planner suite.**

```bash
bun test apps/web-planner/src
```

Expected: green.

- [ ] **Step 4: Run the perf test explicitly and record the numbers.**

```bash
bun test apps/api/src/modules/planner/application/queries/personal/list-tasks-for-actor.handler.performance.spec.ts --testTimeout=180000
```

Paste the `[perf]` log line into the PR description. If the measured p95 is anywhere close to the 200ms budget (e.g. >150ms), flag it for review — headroom matters.

- [ ] **Step 5: Check lint + typecheck.**

```bash
bun run lint
bun run typecheck
```

Fix any issue the changes introduced (imports, unused types).

- [ ] **Step 6: Create the PR.**

Branch: `feat/planner-3-3-my-tasks`. PR title: `feat(planner): My Tasks — four views over personal.listTasks (Plan 3.3)`. Summary must include:

- Perf numbers from Task 4 (`p50 / p95 / max`).
- Whether `idx_task_tenant_plan_deleted_at` (or any other index) was added — link the migration.
- Screenshots of all four views: empty state + populated state (cross-plan tasks).
- Confirmation that `planner.personal.enabled` remains on for the SETA tenant (flipped in Plan 3.2) and that nothing in this plan changed the flag.

---

## Acceptance Checklist

- [ ] `personal.listTasks` returns `TaskFlatWithPlan[]` with correct `planName` + `planKind`.
- [ ] Actor A cannot see any task assigned to them inside Actor B's personal plan (R5 regression guarded by integration test).
- [ ] `personal.getCharts` aggregates across every plan the actor sees; total counts equal `personal.listTasks({ includeCompleted: true })` length.
- [ ] `/personal/tasks/{board,grid,schedule,charts}` routes render for the SETA tenant.
- [ ] Cross-plan Board + Grid display `<PersonalPlanBadge />`; per-plan pages do not.
- [ ] Group-by-Plan puts personal plan first, then team plans alphabetically.
- [ ] `includeCompleted` chip default-off; toggling triggers a re-fetch (new React Query key).
- [ ] Empty states match spec §8.7 verbatim.
- [ ] Performance: p95 < 200ms at 2000 tasks × 50 plans, measured locally and attached to the PR.
- [ ] EXPLAIN ANALYZE shows index scans — no `Seq Scan on planner.task` at this scale.
- [ ] All tests green; overall coverage ≥ 70%.
- [ ] No `Promise.all` anywhere inside `ListTasksForActorHandler` or `GetPersonalChartsHandler`.
- [ ] No `.js` extensions on any new relative import.
- [ ] No new `__tests__/` directories; every `.spec.ts[x]` sits next to its source.
