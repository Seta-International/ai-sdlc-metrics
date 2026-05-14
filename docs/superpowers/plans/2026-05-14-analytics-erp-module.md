# Analytics ERP Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `modules/products/analytics` (`@seta/analytics`) — ERP Module #2, containing Analytics Agent tools (`workload_by_assignee`, `tasks_by_status`, `tasks_by_plan`, `query_analytics` DSL), the `analytics.*` Postgres schema (materialized views), the `chart-ybar.ts` card, and `ANALYTICS_PROFILE_SEED`.

**Architecture:** Product module — imports `@seta/connector-ms365-planner` and `@seta/connector-ms365-directory` directly (allowed per CLAUDE.md: products may import connectors). Never imports from `@seta/planner` or any other product. Analytics tools filter by plan membership using `connector_ms365_planner.plan_members` directly (no cross-product import of `planner.v_visible_plans`). The `analyticsTools` map is exported for `apps/api` to register into the tool registry at startup. Materialized views are refreshed by `apps/api`'s `afterSync` hook.

**Tech Stack:** Drizzle ORM + `drizzle-kit`, Zod, `@seta/agent-core`, `@seta/middleware`, `@seta/tenant`, `lru-cache`

**Depends on:** Plan 1 complete (plan_members table must exist — analytics queries it for permission gating).

---

## File map

| Action | File |
|---|---|
| Create (scaffold) | `modules/products/analytics/` via `pnpm new:package` |
| Create | `modules/products/analytics/src/schema.ts` |
| Create | `modules/products/analytics/drizzle.config.ts` |
| Create | `modules/products/analytics/src/tools/workload_by_assignee.ts` |
| Create | `modules/products/analytics/src/tools/tasks_by_status.ts` |
| Create | `modules/products/analytics/src/tools/tasks_by_plan.ts` |
| Create | `modules/products/analytics/src/tools/query_analytics.ts` |
| Create | `modules/products/analytics/src/cards/chart-ybar.ts` |
| Create | `modules/products/analytics/src/seeds/analytics.ts` |
| Create | `modules/products/analytics/src/index.ts` |
| Create | `modules/products/analytics/src/tools/workload_by_assignee.test.ts` |
| Create | `modules/products/analytics/src/tools/tasks_by_status.test.ts` |
| Create | `modules/products/analytics/src/tools/tasks_by_plan.test.ts` |
| Create | `modules/products/analytics/src/cards/chart-ybar.test.ts` |

---

## Task 1: Scaffold package + install dependencies

**Files:**
- Create: `modules/products/analytics/` (via scaffold)

- [ ] **Step 1: Scaffold the package**

```bash
pnpm new:package
```

When prompted:
- Kind: `product`
- Short name: `analytics`

This creates `modules/products/analytics/` with package name `@seta/analytics`.

- [ ] **Step 2: Add runtime dependencies**

```bash
pnpm --filter @seta/analytics add \
  @seta/agent-core@workspace:* \
  @seta/connector-ms365-planner@workspace:* \
  @seta/connector-ms365-directory@workspace:* \
  @seta/middleware@workspace:* \
  @seta/tenant@workspace:* \
  @seta/db@workspace:* \
  drizzle-orm@0.45.2 \
  lru-cache@11.3.6 \
  zod@4.4.3
```

```bash
pnpm --filter @seta/analytics add -D drizzle-kit@0.31.10
```

- [ ] **Step 3: Create `drizzle.config.ts`**

```typescript
// modules/products/analytics/drizzle.config.ts
import { defineConfig } from 'drizzle-kit'
export default defineConfig({
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  schemaFilter: ['analytics'],
  casing: 'snake_case',
})
```

- [ ] **Step 4: Commit scaffold**

```bash
git add modules/products/analytics/
git commit -m "feat(analytics): scaffold @seta/analytics ERP module"
```

---

## Task 2: DB schema — `analytics` materialized views

Materialized views are raw SQL — drizzle-kit cannot generate `CREATE MATERIALIZED VIEW` DDL. Use `drizzle-kit generate --custom` to produce a migration that drizzle-kit's journal tracks.

**Files:**
- Create: `modules/products/analytics/src/schema.ts`
- Generate: `modules/products/analytics/migrations/`

- [ ] **Step 1: Create `schema.ts`** (empty placeholder — drizzle needs a schema file even for custom-only migrations)

```typescript
// modules/products/analytics/src/schema.ts
import { pgSchema } from 'drizzle-orm/pg-core'

export const analyticsSchema = pgSchema('analytics')
```

- [ ] **Step 2: Generate custom migration for the schema + views**

```bash
pnpm --filter @seta/analytics exec drizzle-kit generate --custom --name create-analytics-schema-and-views
```

- [ ] **Step 3: Write the custom migration SQL**

Open the generated empty `.sql` file and write:

```sql
CREATE SCHEMA IF NOT EXISTS analytics;

-- Workload per assignee per plan
CREATE MATERIALIZED VIEW analytics.mv_assignee_workload AS
SELECT
  t.tenant_id,
  user_id.value                                                                  AS user_id,
  t.plan_id,
  COUNT(*) FILTER (WHERE t.percent_complete < 100)                               AS open_tasks,
  COUNT(*) FILTER (WHERE t.due_date < now()
                     AND t.percent_complete < 100)                               AS overdue_tasks,
  COUNT(*) FILTER (WHERE t.due_date BETWEEN now() AND now() + INTERVAL '7 days'
                     AND t.percent_complete < 100)                               AS due_this_week,
  COUNT(*) FILTER (WHERE t.percent_complete = 100
                     AND t.last_modified_at_graph > now() - INTERVAL '7 days')  AS completed_this_week
FROM connector_ms365_planner.planner_tasks_cache t
CROSS JOIN LATERAL UNNEST(t.assignee_ids) AS user_id(value)
WHERE t.soft_deleted_at IS NULL
GROUP BY t.tenant_id, user_id.value, t.plan_id;

CREATE UNIQUE INDEX ON analytics.mv_assignee_workload (tenant_id, user_id, plan_id);

-- Weekly completed task velocity per plan
CREATE MATERIALIZED VIEW analytics.mv_plan_weekly_velocity AS
SELECT
  tenant_id,
  plan_id,
  date_trunc('week', last_modified_at_graph)  AS week,
  COUNT(*)                                    AS tasks_completed
FROM connector_ms365_planner.planner_tasks_cache
WHERE percent_complete       = 100
  AND last_modified_at_graph IS NOT NULL
  AND soft_deleted_at        IS NULL
GROUP BY tenant_id, plan_id, date_trunc('week', last_modified_at_graph);

CREATE UNIQUE INDEX ON analytics.mv_plan_weekly_velocity (tenant_id, plan_id, week);
```

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @seta/analytics typecheck
```

- [ ] **Step 5: Commit**

```bash
git add modules/products/analytics/src/schema.ts modules/products/analytics/migrations/ modules/products/analytics/drizzle.config.ts
git commit -m "feat(analytics): analytics schema + mv_assignee_workload + mv_plan_weekly_velocity"
```

---

## Task 3: `workload_by_assignee` tool

**Files:**
- Create: `modules/products/analytics/src/tools/workload_by_assignee.ts`
- Create: `modules/products/analytics/src/tools/workload_by_assignee.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// modules/products/analytics/src/tools/workload_by_assignee.test.ts
import { describe, expect, it, vi } from 'vitest'
import { workloadByAssigneeTool } from './workload_by_assignee'

type SqlFn = (strings: TemplateStringsArray, ...v: unknown[]) => Promise<unknown[]>

const makeSql = (rows: unknown[]) => vi.fn<SqlFn>().mockResolvedValue(rows)

describe('workloadByAssigneeTool', () => {
  it('returns rows with display names from directory', async () => {
    const workloadRow = { user_id: 'u1', plan_id: 'p1', open_tasks: 5, overdue_tasks: 1, due_this_week: 2, completed_this_week: 3, tenant_id: 't1' }
    const dirRow = { entra_object_id: 'u1', display_name: 'Alice' }
    const sql = vi.fn<SqlFn>()
      .mockResolvedValueOnce([{ plan_id: 'p1' }])
      .mockResolvedValueOnce([workloadRow])
      .mockResolvedValueOnce([dirRow])
    const tool = workloadByAssigneeTool({ sql: sql as never })
    const ctx = { surface: 'direct', abortSignal: new AbortController().signal, runId: 'r1', requestContext: { runId: 'r1', signal: new AbortController().signal, retryCount: 0, now: Date.now, generateId: () => 'id', currentDate: () => new Date() } } as never
    const result = await tool.execute({ limit: 20 }, ctx)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.rows[0]?.displayName).toBe('Alice')
      expect(result.value.rows[0]?.openTasks).toBe(5)
    }
  })

  it('falls back to user_id when display name not found', async () => {
    const workloadRow = { user_id: 'u2', plan_id: 'p1', open_tasks: 3, overdue_tasks: 0, due_this_week: 1, completed_this_week: 0, tenant_id: 't1' }
    const sql = vi.fn<SqlFn>()
      .mockResolvedValueOnce([{ plan_id: 'p1' }])
      .mockResolvedValueOnce([workloadRow])
      .mockResolvedValueOnce([])
    const tool = workloadByAssigneeTool({ sql: sql as never })
    const ctx = { surface: 'direct', abortSignal: new AbortController().signal, runId: 'r1', requestContext: { runId: 'r1', signal: new AbortController().signal, retryCount: 0, now: Date.now, generateId: () => 'id', currentDate: () => new Date() } } as never
    const result = await tool.execute({ limit: 20 }, ctx)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.rows[0]?.displayName).toBe('u2')
  })
})
```

- [ ] **Step 2: Run — verify fail**

```bash
pnpm --filter @seta/analytics test:unit
```

- [ ] **Step 3: Implement**

```typescript
// modules/products/analytics/src/tools/workload_by_assignee.ts
import type { Tool } from '@seta/agent-core'
import { tenantContext } from '@seta/tenant'
import { z } from 'zod'

type DbSql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>

export interface AnalyticsToolDeps {
  sql: DbSql
}

const Input = z.object({
  planId:       z.string().optional(),
  lookbackDays: z.number().int().min(1).max(90).default(7),
  limit:        z.number().min(1).max(50).default(20),
})

const RowSchema = z.object({
  userId:            z.string(),
  displayName:       z.string(),
  openTasks:         z.number(),
  overdueTasks:      z.number(),
  dueThisWeek:       z.number(),
  completedThisWeek: z.number(),
})

const Output = z.object({
  rows:     z.array(RowSchema),
  planName: z.string().nullable(),
})

interface WorkloadRow {
  user_id: string; plan_id: string; tenant_id: string
  open_tasks: number; overdue_tasks: number; due_this_week: number; completed_this_week: number
}

export function workloadByAssigneeTool(deps: AnalyticsToolDeps): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'analytics.workload_by_assignee',
    description: 'Aggregate task workload per assignee. Use for "who is overloaded", "team capacity".',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { readOnlyHint: true, idempotentHint: true },
    async execute(input, _ctx) {
      try {
        const tenantId = tenantContext.getTenantId()
        const userId   = tenantContext.getUserId()

        // Fetch visible plan IDs for this user (using plan_members directly — no cross-product import)
        const visiblePlanRows = (await deps.sql`
          SELECT DISTINCT plan_id
          FROM connector_ms365_planner.plan_members
          WHERE tenant_id = ${tenantId} AND user_id = ${userId}
        `) as Array<{ plan_id: string }>
        const visiblePlanIds = visiblePlanRows.map((r) => r.plan_id)

        if (visiblePlanIds.length === 0) return { ok: true, value: { rows: [], planName: null } }

        const scopedPlanIds = input.planId ? [input.planId].filter((id) => visiblePlanIds.includes(id)) : visiblePlanIds
        if (scopedPlanIds.length === 0) {
          return { ok: false, error: { name: 'Forbidden', message: 'Plan not in your visible set' } }
        }

        const rawRows = (await deps.sql`
          SELECT user_id, plan_id, tenant_id, open_tasks, overdue_tasks, due_this_week, completed_this_week
          FROM analytics.mv_assignee_workload
          WHERE tenant_id = ${tenantId} AND plan_id = ANY(${scopedPlanIds}::text[])
          ORDER BY open_tasks DESC
          LIMIT ${input.limit}
        `) as WorkloadRow[]

        // Resolve display names from directory (one query for all users)
        const userIds = [...new Set(rawRows.map((r) => r.user_id))]
        const dirRows = (await deps.sql`
          SELECT entra_object_id, display_name
          FROM connector_ms365_directory.directory_users
          WHERE tenant_id = ${tenantId} AND entra_object_id = ANY(${userIds}::text[])
        `) as Array<{ entra_object_id: string; display_name: string }>

        const nameMap = new Map(dirRows.map((r) => [r.entra_object_id, r.display_name]))

        const rows = rawRows.map((r) => ({
          userId:            r.user_id,
          displayName:       nameMap.get(r.user_id) ?? r.user_id,
          openTasks:         Number(r.open_tasks),
          overdueTasks:      Number(r.overdue_tasks),
          dueThisWeek:       Number(r.due_this_week),
          completedThisWeek: Number(r.completed_this_week),
        }))

        let planName: string | null = null
        if (input.planId) {
          const planRow = (await deps.sql`
            SELECT title FROM connector_ms365_planner.planner_plans_cache
            WHERE graph_plan_id = ${input.planId} AND tenant_id = ${tenantId} LIMIT 1
          `) as Array<{ title: string }>
          planName = planRow[0]?.title ?? null
        }

        return { ok: true, value: { rows, planName } }
      } catch (e) {
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}
```

- [ ] **Step 4: Run — verify pass**

```bash
pnpm --filter @seta/analytics test:unit
```

- [ ] **Step 5: Commit**

```bash
git add modules/products/analytics/src/tools/workload_by_assignee.ts modules/products/analytics/src/tools/workload_by_assignee.test.ts
git commit -m "feat(analytics): workload_by_assignee tool"
```

---

## Task 4: `tasks_by_status` tool

**Files:**
- Create: `modules/products/analytics/src/tools/tasks_by_status.ts`
- Create: `modules/products/analytics/src/tools/tasks_by_status.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// modules/products/analytics/src/tools/tasks_by_status.test.ts
import { describe, expect, it, vi } from 'vitest'
import { tasksByStatusTool } from './tasks_by_status'
type SqlFn = (strings: TemplateStringsArray, ...v: unknown[]) => Promise<unknown[]>
describe('tasksByStatusTool', () => {
  it('returns status breakdown', async () => {
    const sql = vi.fn<SqlFn>()
      .mockResolvedValueOnce([{ plan_id: 'p1' }])
      .mockResolvedValueOnce([{ percent_complete: 0, count: 5 }, { percent_complete: 50, count: 3 }, { percent_complete: 100, count: 7 }])
    const tool = tasksByStatusTool({ sql: sql as never })
    const ctx = { surface: 'direct', abortSignal: new AbortController().signal, runId: 'r1', requestContext: { runId: 'r1', signal: new AbortController().signal, retryCount: 0, now: Date.now, generateId: () => 'id', currentDate: () => new Date() } } as never
    const result = await tool.execute({}, ctx)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.rows).toHaveLength(3)
      expect(result.value.rows.find((r) => r.status === 'not_started')?.count).toBe(5)
    }
  })
})
```

- [ ] **Step 2: Run — verify fail**

```bash
pnpm --filter @seta/analytics test:unit
```

- [ ] **Step 3: Implement**

```typescript
// modules/products/analytics/src/tools/tasks_by_status.ts
import type { Tool } from '@seta/agent-core'
import { tenantContext } from '@seta/tenant'
import { z } from 'zod'
import type { AnalyticsToolDeps } from './workload_by_assignee'

const Input  = z.object({ planId: z.string().optional() })
const Output = z.object({
  rows: z.array(z.object({
    status: z.enum(['not_started', 'in_progress', 'completed']),
    count:  z.number(),
  })),
  planName: z.string().nullable(),
})

export function tasksByStatusTool(deps: AnalyticsToolDeps): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'analytics.tasks_by_status',
    description: 'Count tasks grouped by status. Use for "how many in progress vs done".',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { readOnlyHint: true, idempotentHint: true },
    async execute(input, _ctx) {
      try {
        const tenantId = tenantContext.getTenantId()
        const userId   = tenantContext.getUserId()

        const visiblePlanRows = (await deps.sql`
          SELECT DISTINCT plan_id FROM connector_ms365_planner.plan_members
          WHERE tenant_id = ${tenantId} AND user_id = ${userId}
        `) as Array<{ plan_id: string }>
        const visiblePlanIds = visiblePlanRows.map((r) => r.plan_id)

        if (visiblePlanIds.length === 0) return { ok: true, value: { rows: [], planName: null } }

        const scopedIds = input.planId ? [input.planId].filter((id) => visiblePlanIds.includes(id)) : visiblePlanIds
        if (input.planId && scopedIds.length === 0) {
          return { ok: false, error: { name: 'Forbidden', message: 'Plan not in your visible set' } }
        }

        const rawRows = (await deps.sql`
          SELECT percent_complete, COUNT(*)::int AS count
          FROM connector_ms365_planner.planner_tasks_cache
          WHERE tenant_id = ${tenantId}
            AND plan_id = ANY(${scopedIds}::text[])
            AND soft_deleted_at IS NULL
          GROUP BY percent_complete
          ORDER BY percent_complete
        `) as Array<{ percent_complete: number; count: number }>

        const statusMap: Record<string, 'not_started' | 'in_progress' | 'completed'> = {}
        const counts: Record<string, number> = { not_started: 0, in_progress: 0, completed: 0 }
        for (const r of rawRows) {
          const s: 'not_started' | 'in_progress' | 'completed' =
            r.percent_complete === 0   ? 'not_started'  :
            r.percent_complete === 100 ? 'completed'    : 'in_progress'
          counts[s] = (counts[s] ?? 0) + Number(r.count)
          statusMap[s] = s
        }

        const rows = (['not_started', 'in_progress', 'completed'] as const).map((s) => ({
          status: s,
          count: counts[s] ?? 0,
        }))

        let planName: string | null = null
        if (input.planId) {
          const planRow = (await deps.sql`
            SELECT title FROM connector_ms365_planner.planner_plans_cache
            WHERE graph_plan_id = ${input.planId} AND tenant_id = ${tenantId} LIMIT 1
          `) as Array<{ title: string }>
          planName = planRow[0]?.title ?? null
        }

        return { ok: true, value: { rows, planName } }
      } catch (e) {
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}
```

- [ ] **Step 4: Run — verify pass**

```bash
pnpm --filter @seta/analytics test:unit
```

- [ ] **Step 5: Commit**

```bash
git add modules/products/analytics/src/tools/tasks_by_status.ts modules/products/analytics/src/tools/tasks_by_status.test.ts
git commit -m "feat(analytics): tasks_by_status tool"
```

---

## Task 5: `tasks_by_plan` tool

**Files:**
- Create: `modules/products/analytics/src/tools/tasks_by_plan.ts`
- Create: `modules/products/analytics/src/tools/tasks_by_plan.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// modules/products/analytics/src/tools/tasks_by_plan.test.ts
import { describe, expect, it, vi } from 'vitest'
import { tasksByPlanTool } from './tasks_by_plan'
type SqlFn = (strings: TemplateStringsArray, ...v: unknown[]) => Promise<unknown[]>
describe('tasksByPlanTool', () => {
  it('returns open count per plan', async () => {
    const workloadRow = { plan_id: 'p1', open_tasks: 8 }
    const planRow = { graph_plan_id: 'p1', title: 'Atlas' }
    const memberRow = { plan_id: 'p1' }
    const sql = vi.fn<SqlFn>()
      .mockResolvedValueOnce([memberRow])
      .mockResolvedValueOnce([workloadRow])
      .mockResolvedValueOnce([planRow])
    const tool = tasksByPlanTool({ sql: sql as never })
    const ctx = { surface: 'direct', abortSignal: new AbortController().signal, runId: 'r1', requestContext: { runId: 'r1', signal: new AbortController().signal, retryCount: 0, now: Date.now, generateId: () => 'id', currentDate: () => new Date() } } as never
    const result = await tool.execute({ metric: 'open', limit: 10 }, ctx)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.rows[0]?.planName).toBe('Atlas')
      expect(result.value.rows[0]?.count).toBe(8)
    }
  })
})
```

- [ ] **Step 2: Run — verify fail**

```bash
pnpm --filter @seta/analytics test:unit
```

- [ ] **Step 3: Implement**

```typescript
// modules/products/analytics/src/tools/tasks_by_plan.ts
import type { Tool } from '@seta/agent-core'
import { tenantContext } from '@seta/tenant'
import { z } from 'zod'
import type { AnalyticsToolDeps } from './workload_by_assignee'

const Input = z.object({
  metric: z.enum(['open', 'overdue', 'completed_this_week']).default('open'),
  limit:  z.number().min(1).max(20).default(10),
})

const Output = z.object({
  rows: z.array(z.object({
    planId:   z.string(),
    planName: z.string(),
    count:    z.number(),
  })),
})

export function tasksByPlanTool(deps: AnalyticsToolDeps): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'analytics.tasks_by_plan',
    description: 'Count tasks per plan. Use for "which plan has the most open tasks", "overdue by plan".',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { readOnlyHint: true, idempotentHint: true },
    async execute(input, _ctx) {
      try {
        const tenantId = tenantContext.getTenantId()
        const userId   = tenantContext.getUserId()

        const visiblePlanRows = (await deps.sql`
          SELECT DISTINCT plan_id FROM connector_ms365_planner.plan_members
          WHERE tenant_id = ${tenantId} AND user_id = ${userId}
        `) as Array<{ plan_id: string }>
        const visiblePlanIds = visiblePlanRows.map((r) => r.plan_id)

        if (visiblePlanIds.length === 0) return { ok: true, value: { rows: [] } }

        const metricCol =
          input.metric === 'open'               ? 'open_tasks'          :
          input.metric === 'overdue'             ? 'overdue_tasks'       :
          'completed_this_week'

        const rawRows = (await deps.sql`
          SELECT plan_id, SUM(${deps.sql.unsafe(metricCol)})::int AS count
          FROM analytics.mv_assignee_workload
          WHERE tenant_id = ${tenantId} AND plan_id = ANY(${visiblePlanIds}::text[])
          GROUP BY plan_id
          ORDER BY count DESC
          LIMIT ${input.limit}
        `) as Array<{ plan_id: string; count: number }>

        const planIds = rawRows.map((r) => r.plan_id)
        const planRows = (await deps.sql`
          SELECT graph_plan_id, title FROM connector_ms365_planner.planner_plans_cache
          WHERE tenant_id = ${tenantId} AND graph_plan_id = ANY(${planIds}::text[])
        `) as Array<{ graph_plan_id: string; title: string }>

        const planNameMap = new Map(planRows.map((r) => [r.graph_plan_id, r.title]))

        const rows = rawRows.map((r) => ({
          planId:   r.plan_id,
          planName: planNameMap.get(r.plan_id) ?? r.plan_id,
          count:    Number(r.count),
        }))

        return { ok: true, value: { rows } }
      } catch (e) {
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}
```

- [ ] **Step 4: Run — verify pass**

```bash
pnpm --filter @seta/analytics test:unit
```

- [ ] **Step 5: Commit**

```bash
git add modules/products/analytics/src/tools/tasks_by_plan.ts modules/products/analytics/src/tools/tasks_by_plan.test.ts
git commit -m "feat(analytics): tasks_by_plan tool"
```

---

## Task 6: `query_analytics` DSL tool

**Files:**
- Create: `modules/products/analytics/src/tools/query_analytics.ts`

- [ ] **Step 1: Implement `query_analytics.ts`** (no TDD — the DSL compiler is exercised via integration tests)

```typescript
// modules/products/analytics/src/tools/query_analytics.ts
import type { Tool } from '@seta/agent-core'
import { LRUCache } from 'lru-cache'
import { tenantContext } from '@seta/tenant'
import { z } from 'zod'
import type { AnalyticsToolDeps } from './workload_by_assignee'

const Input = z.object({
  metric: z.enum([
    'workload_by_assignee', 'blocked_tasks', 'completion_rate',
    'due_soon', 'velocity', 'capacity_forecast', 'overdue_by_plan', 'unassigned_tasks',
  ]),
  scope: z.object({
    type:   z.enum(['self', 'direct_reports', 'plan', 'org']),
    planId: z.string().optional(),
    userId: z.string().optional(),
  }),
  timeRange: z.object({ from: z.string(), to: z.string() }).optional(),
  groupBy:   z.enum(['assignee', 'plan', 'week', 'status']).optional(),
  limit:     z.number().min(1).max(100).default(20),
})

const Output = z.object({
  rows:     z.array(z.record(z.unknown())),
  metadata: z.object({ metric: z.string(), scope: z.string(), rowCount: z.number() }),
})

const cache = new LRUCache<string, z.infer<typeof Output>>({ max: 200, ttl: 5 * 60 * 1000 })

export function queryAnalyticsTool(deps: AnalyticsToolDeps): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'analytics.query_analytics',
    description: 'Flexible analytics DSL — velocity, completion rate, workload, blocked tasks, due-soon. For trend queries.',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { readOnlyHint: true, idempotentHint: true },
    async execute(input, _ctx) {
      try {
        const tenantId = tenantContext.getTenantId()
        const userId   = tenantContext.getUserId()
        const cacheKey = `analytics:${tenantId}:${userId}:${JSON.stringify(input)}`

        const cached = cache.get(cacheKey)
        if (cached) return { ok: true, value: cached }

        // Resolve visible plan IDs
        const visiblePlanRows = (await deps.sql`
          SELECT DISTINCT plan_id FROM connector_ms365_planner.plan_members
          WHERE tenant_id = ${tenantId} AND user_id = ${userId}
        `) as Array<{ plan_id: string }>
        const visiblePlanIds = visiblePlanRows.map((r) => r.plan_id)

        // Permission gate by scope type
        let scopedPlanIds = visiblePlanIds
        if (input.scope.type === 'plan') {
          if (!input.scope.planId) {
            return { ok: false, error: { name: 'BadRequest', message: 'scope.planId required for scope.type=plan' } }
          }
          if (!visiblePlanIds.includes(input.scope.planId)) {
            return { ok: false, error: { name: 'Forbidden', message: 'Plan not in your visible set' } }
          }
          scopedPlanIds = [input.scope.planId]
        } else if (input.scope.type === 'direct_reports') {
          const dirReports = (await deps.sql`
            SELECT entra_object_id FROM connector_ms365_directory.directory_users
            WHERE manager_id = ${userId} AND tenant_id = ${tenantId}
          `) as Array<{ entra_object_id: string }>
          if (dirReports.length === 0) {
            return { ok: false, error: { name: 'Forbidden', message: 'No direct reports found' } }
          }
        }

        const from = input.timeRange?.from ? new Date(input.timeRange.from) : new Date(Date.now() - 30 * 86400_000)
        const to   = input.timeRange?.to   ? new Date(input.timeRange.to)   : new Date()

        let rows: Array<Record<string, unknown>> = []

        if (input.metric === 'velocity') {
          rows = (await deps.sql`
            SELECT plan_id, week, tasks_completed
            FROM analytics.mv_plan_weekly_velocity
            WHERE tenant_id = ${tenantId}
              AND plan_id = ANY(${scopedPlanIds}::text[])
              AND week BETWEEN ${from} AND ${to}
            ORDER BY week DESC, tasks_completed DESC
            LIMIT ${input.limit}
          `) as Array<Record<string, unknown>>
        } else if (input.metric === 'workload_by_assignee') {
          rows = (await deps.sql`
            SELECT user_id, plan_id, open_tasks, overdue_tasks, due_this_week, completed_this_week
            FROM analytics.mv_assignee_workload
            WHERE tenant_id = ${tenantId} AND plan_id = ANY(${scopedPlanIds}::text[])
            ORDER BY open_tasks DESC
            LIMIT ${input.limit}
          `) as Array<Record<string, unknown>>
        } else if (input.metric === 'overdue_by_plan') {
          rows = (await deps.sql`
            SELECT plan_id, SUM(overdue_tasks)::int AS overdue_total
            FROM analytics.mv_assignee_workload
            WHERE tenant_id = ${tenantId} AND plan_id = ANY(${scopedPlanIds}::text[])
            GROUP BY plan_id ORDER BY overdue_total DESC LIMIT ${input.limit}
          `) as Array<Record<string, unknown>>
        } else if (input.metric === 'unassigned_tasks') {
          rows = (await deps.sql`
            SELECT graph_task_id, title, plan_id, due_date
            FROM connector_ms365_planner.planner_tasks_cache
            WHERE tenant_id = ${tenantId}
              AND plan_id = ANY(${scopedPlanIds}::text[])
              AND percent_complete < 100
              AND (assignee_ids IS NULL OR array_length(assignee_ids, 1) IS NULL)
              AND soft_deleted_at IS NULL
            ORDER BY due_date NULLS LAST
            LIMIT ${input.limit}
          `) as Array<Record<string, unknown>>
        } else if (input.metric === 'due_soon') {
          const soonDate = new Date(Date.now() + 3 * 86400_000)
          rows = (await deps.sql`
            SELECT graph_task_id, title, plan_id, due_date, assignee_ids, percent_complete
            FROM connector_ms365_planner.planner_tasks_cache
            WHERE tenant_id = ${tenantId}
              AND plan_id = ANY(${scopedPlanIds}::text[])
              AND percent_complete < 100
              AND due_date <= ${soonDate}
              AND soft_deleted_at IS NULL
            ORDER BY due_date
            LIMIT ${input.limit}
          `) as Array<Record<string, unknown>>
        } else if (input.metric === 'completion_rate') {
          rows = (await deps.sql`
            SELECT
              plan_id,
              COUNT(*) FILTER (WHERE percent_complete = 100)::int AS completed,
              COUNT(*) FILTER (WHERE percent_complete < 100)::int AS open,
              ROUND(
                100.0 * COUNT(*) FILTER (WHERE percent_complete = 100)
                      / NULLIF(COUNT(*), 0), 1
              ) AS rate_pct
            FROM connector_ms365_planner.planner_tasks_cache
            WHERE tenant_id = ${tenantId}
              AND plan_id = ANY(${scopedPlanIds}::text[])
              AND soft_deleted_at IS NULL
            GROUP BY plan_id ORDER BY rate_pct DESC
            LIMIT ${input.limit}
          `) as Array<Record<string, unknown>>
        } else if (input.metric === 'blocked_tasks') {
          const staleThreshold = new Date(Date.now() - 3 * 86400_000)
          rows = (await deps.sql`
            SELECT graph_task_id, title, plan_id, last_modified_at_graph, assignee_ids
            FROM connector_ms365_planner.planner_tasks_cache
            WHERE tenant_id = ${tenantId}
              AND plan_id = ANY(${scopedPlanIds}::text[])
              AND percent_complete BETWEEN 1 AND 99
              AND last_modified_at_graph < ${staleThreshold}
              AND soft_deleted_at IS NULL
            ORDER BY last_modified_at_graph
            LIMIT ${input.limit}
          `) as Array<Record<string, unknown>>
        } else {
          rows = (await deps.sql`
            SELECT user_id, SUM(open_tasks)::int AS open, SUM(completed_this_week)::int AS completed_this_week
            FROM analytics.mv_assignee_workload
            WHERE tenant_id = ${tenantId} AND plan_id = ANY(${scopedPlanIds}::text[])
            GROUP BY user_id ORDER BY open DESC LIMIT ${input.limit}
          `) as Array<Record<string, unknown>>
        }

        const value: z.infer<typeof Output> = {
          rows,
          metadata: { metric: input.metric, scope: input.scope.type, rowCount: rows.length },
        }
        cache.set(cacheKey, value)
        return { ok: true, value }
      } catch (e) {
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @seta/analytics typecheck
```

- [ ] **Step 3: Commit**

```bash
git add modules/products/analytics/src/tools/query_analytics.ts
git commit -m "feat(analytics): query_analytics DSL tool"
```

---

## Task 7: `chart-ybar.ts` card

**Files:**
- Create: `modules/products/analytics/src/cards/chart-ybar.ts`
- Create: `modules/products/analytics/src/cards/chart-ybar.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// modules/products/analytics/src/cards/chart-ybar.test.ts
import { describe, expect, it } from 'vitest'
import { chartYBarCard } from './chart-ybar'

describe('chartYBarCard', () => {
  it('returns an AdaptiveCard 1.5 with Chart.VerticalBar and title', () => {
    const card = chartYBarCard({
      title: 'Workload',
      series: [
        { label: 'Alice', value: 5 },
        { label: 'Bob',   value: 3 },
      ],
    })
    expect(card.type).toBe('AdaptiveCard')
    expect(card.version).toBe('1.5')
    const chartBlock = (card.body as unknown[]).find(
      (b) => (b as { type: string }).type === 'Chart.VerticalBar',
    ) as { data: Array<{ x: string; y: number }> }
    expect(chartBlock).toBeDefined()
    expect(chartBlock.data).toHaveLength(2)
    expect(chartBlock.data[0]).toEqual({ x: 'Alice', y: 5 })
  })

  it('includes the title in a TextBlock', () => {
    const card = chartYBarCard({ title: 'My Chart', series: [] })
    const tb = (card.body as unknown[]).find(
      (b) => (b as { type: string }).type === 'TextBlock',
    ) as { text: string }
    expect(tb?.text).toBe('My Chart')
  })
})
```

- [ ] **Step 2: Run — verify fail**

```bash
pnpm --filter @seta/analytics test:unit
```

- [ ] **Step 3: Implement**

```typescript
// modules/products/analytics/src/cards/chart-ybar.ts
export interface ChartSeries {
  label:  string
  value:  number
  color?: string
}

export interface ChartYBarData {
  title:  string
  series: ChartSeries[]
}

export interface AdaptiveCard {
  type:    string
  version: string
  body:    unknown[]
}

export function chartYBarCard(data: ChartYBarData): AdaptiveCard {
  return {
    type:    'AdaptiveCard',
    version: '1.5',
    body: [
      {
        type:   'TextBlock',
        text:   data.title,
        weight: 'Bolder',
        size:   'Medium',
      },
      {
        type: 'Chart.VerticalBar',
        data: data.series.map((s) => ({
          x: s.label,
          y: s.value,
          ...(s.color ? { color: s.color } : {}),
        })),
      },
    ],
  }
}
```

- [ ] **Step 4: Run — verify pass**

```bash
pnpm --filter @seta/analytics test:unit
```

- [ ] **Step 5: Commit**

```bash
git add modules/products/analytics/src/cards/
git commit -m "feat(analytics): chart-ybar Adaptive Card builder"
```

---

## Task 8: Seed constants

**Files:**
- Create: `modules/products/analytics/src/seeds/analytics.ts`

- [ ] **Step 1: Create seed file**

```typescript
// modules/products/analytics/src/seeds/analytics.ts
import type { AgentProfileSeed } from '@seta/agent-server'

export const ANALYTICS_SLUG = 'analytics'

export const ANALYTICS_TOOL_IDS = [
  'analytics.workload_by_assignee',
  'analytics.tasks_by_status',
  'analytics.tasks_by_plan',
  'analytics.query_analytics',
]

export const ANALYTICS_WORKING_MEMORY_TEMPLATE = `Active context:
- Last queried plan: {{activePlan}}
- Last metric: {{lastMetric}}`.trim()

export const ANALYTICS_INSTRUCTIONS = `You are the Analytics Agent for SETA International. You answer workload, distribution, velocity, and completion queries about Microsoft Planner tasks.

You always respond with a chart card — never with a plain text table or prose summary for data that can be visualised. Use workload_by_assignee, tasks_by_status, or tasks_by_plan to get the data, then render a chart-ybar card from the result.

You are read-only. You do not create, update, or complete tasks.

Detect the dominant language in the user's message — English, Vietnamese, or EN-VN mix. Respond in that same dominant language.

Tool selection:
- "who's overloaded", "workload by person", "assignee distribution" → analytics.workload_by_assignee
- "task breakdown by status", "how many in progress vs done"        → analytics.tasks_by_status
- "tasks per project", "which plan has the most open tasks"         → analytics.tasks_by_plan
- trend queries ("velocity last N weeks", "completion rate")        → analytics.query_analytics

Always render the result using the chart-ybar card template.`.trim()

export const ANALYTICS_PROFILE_SEED: AgentProfileSeed = {
  slug:                  ANALYTICS_SLUG,
  name:                  'Analytics Agent',
  description:           'Workload, velocity, and task distribution analytics',
  instructions:          ANALYTICS_INSTRUCTIONS,
  model:                 'default',
  toolIds:               ANALYTICS_TOOL_IDS,
  workingMemoryTemplate: ANALYTICS_WORKING_MEMORY_TEMPLATE,
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @seta/analytics typecheck
```

- [ ] **Step 3: Commit**

```bash
git add modules/products/analytics/src/seeds/
git commit -m "feat(analytics): ANALYTICS_PROFILE_SEED constants"
```

---

## Task 9: Public exports + build

**Files:**
- Create: `modules/products/analytics/src/index.ts`

- [ ] **Step 1: Create `index.ts`**

```typescript
// modules/products/analytics/src/index.ts
import type { Tool } from '@seta/agent-core'
import type { AnalyticsToolDeps } from './tools/workload_by_assignee.js'
import { workloadByAssigneeTool } from './tools/workload_by_assignee.js'
import { tasksByStatusTool } from './tools/tasks_by_status.js'
import { tasksByPlanTool } from './tools/tasks_by_plan.js'
import { queryAnalyticsTool } from './tools/query_analytics.js'

export { chartYBarCard } from './cards/chart-ybar.js'
export type { ChartYBarData, ChartSeries } from './cards/chart-ybar.js'
export { ANALYTICS_PROFILE_SEED, ANALYTICS_TOOL_IDS, ANALYTICS_SLUG } from './seeds/analytics.js'
export { analyticsSchema } from './schema.js'

export function createAnalyticsTools(deps: AnalyticsToolDeps): Record<string, Tool> {
  const tools = [
    workloadByAssigneeTool(deps),
    tasksByStatusTool(deps),
    tasksByPlanTool(deps),
    queryAnalyticsTool(deps),
  ]
  return Object.fromEntries(tools.map((t) => [t.id, t]))
}
```

- [ ] **Step 2: Build**

```bash
pnpm --filter @seta/analytics build
```

Expected: `dist/index.js` + `dist/index.d.ts` with no errors.

- [ ] **Step 3: Run all tests**

```bash
pnpm --filter @seta/analytics test:unit
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add modules/products/analytics/src/index.ts
git commit -m "feat(analytics): public API — createAnalyticsTools factory + analyticsTools export"
```

---

*Plan 4 of 5. Next: Plan 5 — `@seta/ms-teams` rename + `apps/api` composition root wiring.*
