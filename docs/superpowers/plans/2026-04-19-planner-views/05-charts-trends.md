# Plan 05 — Charts View (Trend Tier): Burndown + Throughput + Nightly Snapshot

> Covers spec **Plan 2.5** — see [design spec §5.2–5.4, §6.7.2, §9](../../specs/2026-04-19-planner-views-design.md).
> Depends on Plan 04 being merged (Charts page infrastructure + palette tokens).

**Goal:** Ship the trend tier of the Charts view — **Burndown** (line) + **Throughput per week** (bar) — backed by a new nightly snapshot table and job. This is the only plan in Sub-project #2 with a schema change. The snapshot job runs daily, is idempotent, and scales via sharded batching for large tenants. The Charts page gains a `RangePicker` (7d / 30d / 90d) and renders the trend section below the existing snapshot section behind `planner.charts.trends.enabled`.

**Architecture:** New table `planner.task_daily_snapshot` stores end-of-day counts per plan. A pg-boss recurring job runs at 00:15 UTC, computes yesterday's snapshot for each plan, and upserts idempotently. A new tRPC query `tasks.getTrends` returns a precomputed series over the requested range. The Charts page reads trends via a second React Query hook and renders two ECharts panels using the existing `@future/charts` infrastructure + palette tokens from Plan 04.

**Tech stack:** pg-boss (existing `PgBossService`), Drizzle migrations, `@future/charts`, existing RLS middleware.

---

## File Map

| File                                                                                                 | Action | Purpose                                        |
| ---------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------- |
| `packages/db/src/migrations/NNNN_planner_task_daily_snapshot.sql`                                    | Create | Migration: table + RLS policy + indexes        |
| `apps/api/src/modules/planner/infrastructure/schema/task-daily-snapshot.ts`                          | Create | Drizzle table definition                       |
| `apps/api/src/modules/planner/infrastructure/schema/index.ts`                                        | Modify | Export the new table                           |
| `apps/api/src/modules/planner/domain/repositories/task-daily-snapshot.repository.ts`                 | Create | Port                                           |
| `apps/api/src/modules/planner/infrastructure/repositories/drizzle-task-daily-snapshot.repository.ts` | Create | Drizzle impl                                   |
| `apps/api/src/modules/planner/application/queries/tasks/get-trends.query.ts`                         | Create | Query DTO                                      |
| `apps/api/src/modules/planner/application/queries/tasks/get-trends.handler.ts`                       | Create | Query handler                                  |
| `apps/api/src/modules/planner/application/queries/tasks/get-trends.handler.integration.spec.ts`      | Create | Integration test                               |
| `apps/api/src/modules/planner/interface/trpc/task.router.ts`                                         | Modify | Add `getTrends` procedure                      |
| `apps/api/src/modules/planner/infrastructure/jobs/task-daily-snapshot.worker.ts`                     | Create | pg-boss worker                                 |
| `apps/api/src/modules/planner/infrastructure/jobs/task-daily-snapshot.worker.spec.ts`                | Create | Unit test for idempotent upsert                |
| `apps/api/src/modules/planner/infrastructure/jobs/task-daily-snapshot.worker.integration.spec.ts`    | Create | Integration test hitting real DB               |
| `apps/api/src/modules/planner/infrastructure/jobs/task-daily-snapshot.scheduler.ts`                  | Create | Registers the recurring job at 00:15 UTC       |
| `apps/api/src/modules/planner/planner.module.ts`                                                     | Modify | Register repo + worker + scheduler             |
| `packages/api-client/src/planner/task-trends.ts`                                                     | Create | Shared `TaskTrends` type                       |
| `apps/web-planner/src/lib/hooks/useTaskTrends.ts`                                                    | Create | React Query wrapper                            |
| `apps/web-planner/src/components/charts/RangePicker.tsx`                                             | Create | 7d / 30d / 90d segmented toggle                |
| `apps/web-planner/src/components/charts/TrendsSection.tsx`                                           | Create | Two-panel wrapper                              |
| `apps/web-planner/src/components/charts/panels/BurndownLine.tsx`                                     | Create | Burndown ECharts panel                         |
| `apps/web-planner/src/components/charts/panels/ThroughputBar.tsx`                                    | Create | Throughput ECharts panel                       |
| `apps/web-planner/src/lib/trends-options.ts`                                                         | Create | Pure option builders for burndown + throughput |
| `apps/web-planner/src/lib/trends-options.spec.ts`                                                    | Create | Unit tests                                     |
| `apps/web-planner/src/components/charts/ChartsGrid.tsx`                                              | Modify | Append `<TrendsSection />` behind flag         |
| `apps/web-planner/e2e/charts-trends.e2e.ts`                                                          | Create | Playwright: snapshot backfill + range switch   |

---

## Task 1 — Drizzle schema for `task_daily_snapshot`

**Files:**

- Create: `apps/api/src/modules/planner/infrastructure/schema/task-daily-snapshot.ts`
- Modify: `apps/api/src/modules/planner/infrastructure/schema/index.ts`

- [ ] **Step 1:** Define the table.

```ts
// task-daily-snapshot.ts
import { pgTable, date, integer, jsonb, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core'
import { plannerSchema } from './_schema'

export const taskDailySnapshot = plannerSchema.table(
  'task_daily_snapshot',
  {
    tenantId: uuid('tenant_id').notNull(),
    planId: uuid('plan_id').notNull(),
    snapshotDate: date('snapshot_date').notNull(),
    totalCount: integer('total_count').notNull(),
    openCount: integer('open_count').notNull(),
    completedCount: integer('completed_count').notNull(),
    byPriority: jsonb('by_priority')
      .$type<Record<'urgent' | 'important' | 'medium' | 'low', number>>()
      .notNull(),
    byBucket: jsonb('by_bucket').$type<Record<string, number>>().notNull(),
    byAssignee: jsonb('by_assignee')
      .$type<Array<{ actorId: string; open: number; completed: number }>>()
      .notNull(),
    completedInDay: integer('completed_in_day').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tenantId, t.planId, t.snapshotDate] }),
  }),
)
```

- [ ] **Step 2:** Add to the schema barrel.

- [ ] **Step 3:** Commit.

---

## Task 2 — Generate migration + RLS policy

**Files:**

- Create: `packages/db/src/migrations/NNNN_planner_task_daily_snapshot.sql`

- [ ] **Step 1:** Generate via `bun run db:generate` (or the project's equivalent `drizzle-kit generate` wrapper). Inspect the generated SQL.

- [ ] **Step 2:** Extend the generated migration to add the RLS policy and helpful indexes. Match the style of the existing `planner.task` migration.

```sql
CREATE INDEX task_daily_snapshot_plan_date_idx
  ON planner.task_daily_snapshot (plan_id, snapshot_date DESC);

ALTER TABLE planner.task_daily_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY task_daily_snapshot_tenant_isolation ON planner.task_daily_snapshot
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

- [ ] **Step 3:** Test the migration up/down on a fresh database.

```bash
bun run --filter @future/db migrate:test
```

- [ ] **Step 4:** Commit.

```bash
git add packages/db/src/migrations/
git commit -m "feat(db): migration for planner.task_daily_snapshot with RLS"
```

---

## Task 3 — Repository port + Drizzle impl (TDD)

**Files:**

- Create: `apps/api/src/modules/planner/domain/repositories/task-daily-snapshot.repository.ts`
- Create: `apps/api/src/modules/planner/infrastructure/repositories/drizzle-task-daily-snapshot.repository.ts`
- Create: `apps/api/src/modules/planner/infrastructure/repositories/drizzle-task-daily-snapshot.repository.integration.spec.ts`

- [ ] **Step 1:** Define the port:

```ts
// task-daily-snapshot.repository.ts
export const TASK_DAILY_SNAPSHOT_REPOSITORY = Symbol('TASK_DAILY_SNAPSHOT_REPOSITORY')

export interface Snapshot {
  tenantId: string
  planId: string
  snapshotDate: string // ISO date, no time
  totalCount: number
  openCount: number
  completedCount: number
  byPriority: Record<'urgent' | 'important' | 'medium' | 'low', number>
  byBucket: Record<string, number>
  byAssignee: Array<{ actorId: string; open: number; completed: number }>
  completedInDay: number
}

export interface ITaskDailySnapshotRepository {
  upsert(snapshot: Snapshot): Promise<void>
  listForPlanInRange(planId: string, startDate: string, endDate: string): Promise<Snapshot[]>
  listDistinctPlanIds(tenantId: string): Promise<string[]>
}
```

- [ ] **Step 2:** Integration test first. Covers:
  - `upsert` is idempotent (running twice with same key overwrites).
  - `listForPlanInRange` returns snapshots ordered by date ASC.
  - RLS: other-tenant rows invisible.

- [ ] **Step 3:** Run — fail.
- [ ] **Step 4:** Implement the Drizzle repo. Use `ON CONFLICT (tenant_id, plan_id, snapshot_date) DO UPDATE SET …`.
- [ ] **Step 5:** Run — pass.
- [ ] **Step 6:** Commit.

---

## Task 4 — Snapshot worker (TDD)

**Files:**

- Create: `apps/api/src/modules/planner/infrastructure/jobs/task-daily-snapshot.worker.ts`
- Create: `apps/api/src/modules/planner/infrastructure/jobs/task-daily-snapshot.worker.spec.ts`
- Create: `apps/api/src/modules/planner/infrastructure/jobs/task-daily-snapshot.worker.integration.spec.ts`

- [ ] **Step 1: Unit test.** Mocks the repo + task repo; verifies the worker computes the correct snapshot fields.

```ts
// task-daily-snapshot.worker.spec.ts
describe('TaskDailySnapshotWorker.handle', () => {
  it('builds a snapshot for yesterday from current task state', async () => {
    const tasks = buildFixture([
      { priority: 'urgent', progress: 'in-progress', assignees: ['a1'], bucketId: 'b1' },
      {
        priority: 'urgent',
        progress: 'completed',
        assignees: ['a1'],
        bucketId: 'b1',
        completedAt: '2026-04-18T15:00Z',
      },
      { priority: 'medium', progress: 'not-started', assignees: ['a2'], bucketId: 'b2' },
    ])
    const worker = new TaskDailySnapshotWorker(snapshotRepoMock, taskRepoMock)
    await worker.handle({
      data: { tenantId: 't1', planId: 'p1', snapshotDate: '2026-04-18' },
    } as any)

    expect(snapshotRepoMock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        totalCount: 3,
        openCount: 2,
        completedCount: 1,
        completedInDay: 1,
        byPriority: { urgent: 2, important: 0, medium: 1, low: 0 },
        byBucket: { b1: 2, b2: 1 },
      }),
    )
  })

  it('is idempotent: running twice produces one upsert call with identical payload', async () => {
    /* … */
  })
})
```

- [ ] **Step 2: Run — fail.**

- [ ] **Step 3: Implement the worker.**

```ts
// task-daily-snapshot.worker.ts
import { Inject, Injectable, Logger } from '@nestjs/common'
import type PgBoss from 'pg-boss'
import type {
  ITaskDailySnapshotRepository,
  Snapshot,
} from '../../domain/repositories/task-daily-snapshot.repository'
import { TASK_DAILY_SNAPSHOT_REPOSITORY } from '../../domain/repositories/task-daily-snapshot.repository'
import type { ITaskRepository } from '../../domain/repositories/task.repository'
import { TASK_REPOSITORY } from '../../domain/repositories/task.repository'

export interface TaskDailySnapshotJobData {
  tenantId: string
  planId: string
  snapshotDate: string // YYYY-MM-DD
}

@Injectable()
export class TaskDailySnapshotWorker {
  private readonly logger = new Logger(TaskDailySnapshotWorker.name)

  constructor(
    @Inject(TASK_DAILY_SNAPSHOT_REPOSITORY)
    private readonly snapshots: ITaskDailySnapshotRepository,
    @Inject(TASK_REPOSITORY) private readonly tasks: ITaskRepository,
  ) {}

  async handle(job: PgBoss.Job<TaskDailySnapshotJobData>): Promise<void> {
    const { tenantId, planId, snapshotDate } = job.data
    // Sequential — RLS single-client rule
    const allTasks = await this.tasks.listByPlanIncludingCompleted(planId)
    const completedYesterday = allTasks.filter(
      (t) => t.completedAt !== null && t.completedAt.toISOString().slice(0, 10) === snapshotDate,
    ).length

    const byPriority: Snapshot['byPriority'] = { urgent: 0, important: 0, medium: 0, low: 0 }
    const byBucket: Snapshot['byBucket'] = {}
    const byAssignee: Map<string, { open: number; completed: number }> = new Map()
    let openCount = 0,
      completedCount = 0

    for (const t of allTasks) {
      byPriority[t.priority] += 1
      byBucket[t.bucketId] = (byBucket[t.bucketId] ?? 0) + 1
      const isOpen = t.progress !== 'completed'
      if (isOpen) openCount += 1
      else completedCount += 1
      for (const actorId of t.assigneeActorIds) {
        const e = byAssignee.get(actorId) ?? { open: 0, completed: 0 }
        if (isOpen) e.open += 1
        else e.completed += 1
        byAssignee.set(actorId, e)
      }
    }

    await this.snapshots.upsert({
      tenantId,
      planId,
      snapshotDate,
      totalCount: allTasks.length,
      openCount,
      completedCount,
      byPriority,
      byBucket,
      byAssignee: [...byAssignee.entries()].map(([actorId, v]) => ({ actorId, ...v })),
      completedInDay: completedYesterday,
    })
  }
}
```

- [ ] **Step 4:** Run unit tests — pass.

- [ ] **Step 5: Integration test** against real DB with the RLS middleware. Seeds a small plan, runs the worker, asserts the snapshot row.

- [ ] **Step 6:** Commit.

---

## Task 5 — Scheduler registration

**Files:**

- Create: `apps/api/src/modules/planner/infrastructure/jobs/task-daily-snapshot.scheduler.ts`
- Modify: `apps/api/src/modules/planner/planner.module.ts`

- [ ] **Step 1:** On module bootstrap, register a `planner.task-daily-snapshot-fanout` recurring job (pg-boss `schedule(name, cron)`) at `15 0 * * *` UTC. The handler of that job enumerates plan_ids per tenant and enqueues one per-plan job.

```ts
// task-daily-snapshot.scheduler.ts
@Injectable()
export class TaskDailySnapshotScheduler implements OnModuleInit {
  private readonly logger = new Logger(TaskDailySnapshotScheduler.name)
  constructor(
    private readonly pgBoss: PgBossService,
    @Inject(TASK_DAILY_SNAPSHOT_REPOSITORY)
    private readonly snapshots: ITaskDailySnapshotRepository,
    private readonly tenantRegistry: TenantRegistry, // existing from kernel
  ) {}

  async onModuleInit(): Promise<void> {
    const boss = this.pgBoss.instance
    await boss.schedule('planner.task-daily-snapshot-fanout', '15 0 * * *', {}, { tz: 'UTC' })

    await boss.work('planner.task-daily-snapshot-fanout', async () => {
      const tenants = await this.tenantRegistry.listActive()
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
      for (const t of tenants) {
        const planIds = await this.snapshots.listDistinctPlanIds(t.id)
        // Sharded batches of 50
        for (let i = 0; i < planIds.length; i += 50) {
          const chunk = planIds.slice(i, i + 50)
          for (const planId of chunk) {
            await boss.send('planner.task-daily-snapshot', {
              tenantId: t.id,
              planId,
              snapshotDate: yesterday,
            })
          }
          if (i + 50 < planIds.length) await new Promise((r) => setTimeout(r, 500)) // short delay between batches
        }
      }
    })

    await boss.work(
      'planner.task-daily-snapshot',
      { teamSize: 3, teamConcurrency: 1 },
      async (job) => {
        await this.worker.handle(job as any)
      },
    )
  }
}
```

- [ ] **Step 2:** Register the scheduler + worker + repo in `planner.module.ts`.

- [ ] **Step 3:** Integration test asserting that `onModuleInit` registers the two job handlers (spy on `pgBoss.work`).

- [ ] **Step 4:** Commit.

---

## Task 6 — Replace `listDistinctPlanIds` with a cheaper query

During Task 5 it's easy to misuse `task_daily_snapshot` as the source of plan IDs; but on day 1 the snapshot table is empty. Instead, the fanout must enumerate from `planner.plan` directly.

- [ ] **Step 1:** Move `listDistinctPlanIds(tenantId)` from the snapshot repo to the existing `IPlanRepository.listAllIds(tenantId)` method. Grep for `PlanRepository` to find the right file.

- [ ] **Step 2:** Update scheduler to call the plan repo.

- [ ] **Step 3:** Regression-test that fanout enqueues 0 jobs for a tenant with no plans.

- [ ] **Step 4:** Commit.

---

## Task 7 — `tasks.getTrends` query + handler (TDD)

**Files:**

- Create: `apps/api/src/modules/planner/application/queries/tasks/get-trends.query.ts`
- Create: `apps/api/src/modules/planner/application/queries/tasks/get-trends.handler.ts`
- Create: `apps/api/src/modules/planner/application/queries/tasks/get-trends.handler.integration.spec.ts`
- Modify: `apps/api/src/modules/planner/interface/trpc/task.router.ts`

- [ ] **Step 1: Integration test.** Seeds three snapshots for a plan. Runs `getTrends`. Asserts:
  - `series` has one entry per snapshot in the range.
  - `weeklyThroughput` sums `completedInDay` per ISO week.
  - Empty range returns `series: [], weeklyThroughput: []` + correct `rangeStart`/`rangeEnd`.
  - RLS: non-member actor 404.

- [ ] **Step 2: Run — fail.**

- [ ] **Step 3: Implement.**

```ts
// get-trends.handler.ts
export class GetTaskTrendsHandler implements IQueryHandler<GetTaskTrendsQuery, TaskTrends> {
  constructor(
    @Inject(TASK_DAILY_SNAPSHOT_REPOSITORY)
    private readonly snapshots: ITaskDailySnapshotRepository,
    @Inject(PLAN_AUTHORIZATION_SERVICE) private readonly auth: PlanAuthorizationService,
  ) {}

  async execute(q: GetTaskTrendsQuery): Promise<TaskTrends> {
    await this.auth.assertCanRead(q.actorId, q.planId)

    const days = { '7d': 7, '30d': 30, '90d': 90 }[q.range]
    const endDate = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10) // yesterday
    const startDate = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
    const rows = await this.snapshots.listForPlanInRange(q.planId, startDate, endDate)

    const series = rows.map((s) => ({
      date: s.snapshotDate,
      openCount: s.openCount,
      completedCount: s.completedCount,
      completedInDay: s.completedInDay,
    }))

    const weeklyThroughput = aggregateByIsoWeek(series)

    return { rangeStart: startDate, rangeEnd: endDate, series, weeklyThroughput }
  }
}

function aggregateByIsoWeek(series: TaskTrends['series']): TaskTrends['weeklyThroughput'] {
  // Mon-start ISO weeks
  const byWeek = new Map<string, number>()
  for (const s of series) {
    const d = new Date(s.date + 'T00:00:00Z')
    const isoDow = (d.getUTCDay() + 6) % 7
    const monday = new Date(d.getTime() - isoDow * 86_400_000).toISOString().slice(0, 10)
    byWeek.set(monday, (byWeek.get(monday) ?? 0) + s.completedInDay)
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, completedCount]) => ({ weekStart, completedCount }))
}
```

- [ ] **Step 4:** Expose at `tasks.getTrends` in the tRPC router with zod input validation.

- [ ] **Step 5:** Run — pass.

- [ ] **Step 6:** Commit.

```bash
git add apps/api/src/modules/planner/application/queries/tasks/get-trends* apps/api/src/modules/planner/interface/trpc/task.router.ts
git commit -m "feat(api/planner): tasks.getTrends query backed by task_daily_snapshot"
```

---

## Task 8 — `TaskTrends` shared type

**Files:**

- Create: `packages/api-client/src/planner/task-trends.ts`
- Modify: `packages/api-client/src/planner/index.ts`

- [ ] **Step 1:** Define the type.

```ts
// task-trends.ts
export type TaskTrends = {
  rangeStart: string
  rangeEnd: string
  series: Array<{ date: string; openCount: number; completedCount: number; completedInDay: number }>
  weeklyThroughput: Array<{ weekStart: string; completedCount: number }>
}
```

- [ ] **Step 2:** Export, build.
- [ ] **Step 3:** Commit.

---

## Task 9 — `useTaskTrends` hook

**Files:**

- Create: `apps/web-planner/src/lib/hooks/useTaskTrends.ts`

- [ ] **Step 1:** Wrap `trpc.planner.tasks.getTrends.useQuery` with a stable stale-time (5 min — trends don't change intraday).

- [ ] **Step 2:** Commit.

---

## Task 10 — `RangePicker` component (TDD)

**Files:**

- Create: `apps/web-planner/src/components/charts/RangePicker.tsx`

- [ ] **Step 1: Test** — reads/writes `state.trendRange` in `useViewState`; default is `30d`.

- [ ] **Step 2:** Implement using `@future/ui` ToggleGroup.

- [ ] **Step 3:** Commit.

---

## Task 11 — `trends-options` builders (TDD)

**Files:**

- Create: `apps/web-planner/src/lib/trends-options.ts`
- Create: `apps/web-planner/src/lib/trends-options.spec.ts`

- [ ] **Step 1: Test** each builder.

```ts
// trends-options.spec.ts
describe('burndownOption', () => {
  it('builds a line chart with openCount series and a dashed projection line', () => {
    const trends = mkTrends({
      rangeStart: '2026-04-01',
      rangeEnd: '2026-04-19',
      series: [
        /* 19 points */
      ],
    })
    const opt = burndownOption(trends)
    const [actual, projection] = opt.series as any[]
    expect(actual.type).toBe('line')
    expect(actual.data).toHaveLength(19)
    expect(projection.lineStyle).toMatchObject({ type: 'dashed' })
  })

  it('returns empty-state sentinel when series is empty', () => {
    expect(burndownOption(mkTrends({ series: [], weeklyThroughput: [] })).series).toEqual([])
  })
})

describe('throughputOption', () => {
  it('bar per week ordered by weekStart', () => {
    /* … */
  })
})
```

- [ ] **Step 2:** Run — fail.

- [ ] **Step 3:** Implement.

```ts
// trends-options.ts — excerpt
import { chartTokens } from '@future/ui/tokens/chart'
import type { TaskTrends } from '@future/api-client/planner'

export function burndownOption(trends: TaskTrends): EChartsOption {
  if (trends.series.length === 0) return emptyOption()

  const x = trends.series.map((s) => s.date)
  const y = trends.series.map((s) => s.openCount)
  const projected = linearProjection(y, Math.max(7, y.length)) // extend to at least 7 future days

  return {
    grid: { top: 20, right: 20, bottom: 40, left: 48 },
    xAxis: { type: 'category', data: [...x, ...projected.futureDates] },
    yAxis: { type: 'value', min: 0 },
    tooltip: { trigger: 'axis' },
    color: [chartTokens.progress['in-progress']],
    series: [
      { name: 'Open', type: 'line', data: y, smooth: true },
      {
        name: 'Projected',
        type: 'line',
        data: [...Array(y.length).fill(null), ...projected.values],
        lineStyle: { type: 'dashed' },
        symbol: 'none',
      },
    ],
  }
}

function linearProjection(
  y: number[],
  horizonDays: number,
): { values: number[]; futureDates: string[] } {
  // Ordinary least squares over (i, y[i]) for i in [0..n-1].
  // Clamp projected values >= 0 and treat slope >= 0 as flat (no burn-up projection).
  const n = y.length
  if (n < 2) return { values: [], futureDates: [] }
  const xMean = (n - 1) / 2
  const yMean = y.reduce((a, b) => a + b, 0) / n
  let num = 0,
    den = 0
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (y[i] - yMean)
    den += (i - xMean) ** 2
  }
  const slope = den === 0 ? 0 : num / den
  const intercept = yMean - slope * xMean
  const effectiveSlope = slope >= 0 ? 0 : slope
  const values: number[] = []
  for (let i = n; i < n + horizonDays; i++) {
    values.push(Math.max(0, intercept + effectiveSlope * i))
  }
  const lastDate = new Date(/* last snapshot date — caller injects */ Date.now())
  const futureDates = Array.from({ length: horizonDays }, (_, i) =>
    new Date(lastDate.getTime() + (i + 1) * 86_400_000).toISOString().slice(0, 10),
  )
  return { values, futureDates }
}
```

- [ ] **Step 4:** Run — pass.

- [ ] **Step 5:** Commit.

---

## Task 12 — Panel components (TDD)

**Files:**

- Create: `apps/web-planner/src/components/charts/panels/BurndownLine.tsx`
- Create: `apps/web-planner/src/components/charts/panels/ThroughputBar.tsx`

- [ ] **Step 1: Test** each panel renders `<EChart />` with the expected option and shows the empty state when trends has no data.

- [ ] **Step 2:** Implement as thin wrappers, same pattern as Plan 04 panels.

- [ ] **Step 3:** Commit.

---

## Task 13 — `TrendsSection` assembly

**Files:**

- Create: `apps/web-planner/src/components/charts/TrendsSection.tsx`

- [ ] **Step 1: Test**:
  - Renders RangePicker + 2 panels.
  - When `trends.series.length === 0`, renders empty-state `<Alert>`: "Trend data begins on …".
  - Flag off → returns `null`.

- [ ] **Step 2:** Implement.

```tsx
// TrendsSection.tsx
'use client'
import { useTaskTrends } from '@/lib/hooks/useTaskTrends'
import { useViewState } from '@/lib/view-state'
import { BurndownLine } from './panels/BurndownLine'
import { ThroughputBar } from './panels/ThroughputBar'
import { RangePicker } from './RangePicker'
import { Alert, AlertDescription } from '@future/ui'
import { Info } from 'lucide-react'

export function TrendsSection({ planId, enabled }: { planId: string; enabled: boolean }) {
  const { state } = useViewState({ planId })
  const range = state.trendRange ?? '30d'
  const { data, isLoading } = useTaskTrends({ planId, range, enabled })

  if (!enabled) return null
  if (isLoading) return <TrendsSkeleton />

  return (
    <section className="border-t border-border px-6 py-6">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Trends</h2>
        <div className="flex items-center gap-3">
          <RangePicker planId={planId} />
          <Info
            className="size-4 text-muted-foreground"
            aria-label="Trends are plan-wide and not affected by the filter bar"
          />
        </div>
      </header>
      {data && data.series.length === 0 ? (
        <Alert>
          <AlertDescription>
            Trend data begins on {data.rangeStart}. Come back in a few days for a full picture.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <BurndownLine trends={data!} />
          <ThroughputBar trends={data!} />
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 3:** Run — pass.
- [ ] **Step 4:** Commit.

---

## Task 14 — Append `TrendsSection` to ChartsGrid

**Files:**

- Modify: `apps/web-planner/src/components/charts/ChartsGrid.tsx`

- [ ] **Step 1:** Read `planner.charts.trends.enabled` at the page level (pass as prop). Append `<TrendsSection />` below the snapshot panels.

- [ ] **Step 2:** Integration test: with flag false, trends section absent; with flag true, present.

- [ ] **Step 3:** Commit.

---

## Task 15 — Playwright E2E

**Files:**

- Create: `apps/web-planner/e2e/charts-trends.e2e.ts`

- [ ] **Step 1:** Seed via a test-only fixture factory that inserts 30 days of synthetic `task_daily_snapshot` rows for a plan.
- [ ] **Step 2:** Steps:
  1. Open Charts.
  2. Assert Trends section visible with 30d default.
  3. Switch range to 7d. Assert fewer data points.
  4. Switch to a plan with no snapshots. Assert "Trend data begins on …" empty state.
- [ ] **Step 3:** Commit.

---

## Task 16 — Manual verification of the nightly job

- [ ] **Step 1:** On staging, wait one nightly cycle. Verify:
  - pg-boss job executed (`select * from pgboss.job where name = 'planner.task-daily-snapshot' order by createdon desc`).
  - Snapshot rows exist for yesterday.
  - Run again — idempotent upsert, row count unchanged.
- [ ] **Step 2:** Document the verification in the PR description with query output.

---

## Task 17 — Flip `planner.charts.trends.enabled` for SETA tenant

- [ ] **Step 1:** Flip flag on for internal tenant.
- [ ] **Step 2:** Observe Trends section. Wait ~7 days in staging to accumulate a visible burndown.
- [ ] **Step 3:** Open PR for production rollout.

---

## Acceptance

- Migration applies cleanly up/down on a fresh database.
- Nightly fanout + per-plan worker registered with pg-boss on module init.
- Worker is idempotent; re-running for the same date overwrites.
- `tasks.getTrends` returns correct `series` and `weeklyThroughput` for seeded fixtures.
- Trends section renders empty-state when no snapshots exist; renders Burndown + Throughput charts when data present.
- Coverage ≥70% across new backend and frontend files.
- No `Promise.all` for DB queries in any new handler (CLAUDE.md rule).

## Risks for this plan

| Risk                                                                | Mitigation                                                                                                                                                                                  |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nightly job runs long on large tenants                              | Sharded batches of 50 plans with 500 ms delay; team-concurrency 3. Monitor duration; alert > 15 min. Future-optimization: move to SET-based SQL if per-plan iteration becomes a bottleneck. |
| Duplicate enqueue from scheduler + leftover pgboss state            | pg-boss `schedule(name, cron)` is idempotent by name. Test asserts `listSchedules()` returns exactly one entry post-init.                                                                   |
| Snapshot job misses a day during downtime                           | Acceptable — trend charts tolerate gaps. Future improvement: catch-up job that fills missing dates for the last 7 days. Document as follow-up.                                              |
| Timezone ambiguity in `snapshot_date`                               | All dates stored as UTC `YYYY-MM-DD`. Display uses tenant TZ for labels only. Documented inline.                                                                                            |
| `listAllIds(tenantId)` scanning every plan even for dormant tenants | Acceptable at current scale. Add an `active_since` filter later if 10k+ dormant plans accumulate.                                                                                           |
| Burndown projection misleads (linear regression on non-linear work) | Dashed line + hover tooltip clarifies "Projection assumes steady pace". If real user feedback calls it confusing, hide projection behind a toggle.                                          |
| RLS lookup failing inside pg-boss job (no session context)          | Scheduler sets `app.tenant_id` before calling worker handler — covered by integration test running through the real RLS middleware.                                                         |
| Snapshot job reads `completedAt` but the column may not exist       | Pre-check: grep `task.entity.ts` and schema for `completed_at`. If missing, escalate back to Plan #1's schema (should exist — Task aggregate spec uses it).                                 |
