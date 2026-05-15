# Production Readiness Audit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 40 DDD boundary, logging, error handling, env hygiene, and tenant-context violations identified in the production readiness audit.

**Architecture:** Five independent PR categories executed in order. Each category produces a passing `pnpm lint && pnpm typecheck && pnpm test:unit`. Categories 1–5 are sequenced because Category 5's `requireConsent` signature change must be applied after Category 1's consent-check extraction.

**Tech Stack:** TypeScript (ESM), Hono, Drizzle ORM, Postgres (postgres.js), Pino logger, `@seta/observability`, `@seta/middleware`, `@seta/tenant`

---

## Verification command (run after every commit)

```bash
pnpm lint && pnpm typecheck && pnpm test:unit
```

Expected: no errors, all tests pass.

---

## Category 1 — DDD Boundary Violations

### Task 1: Re-export ms-graph types from connector-ms365-planner

**Files:**
- Modify: `modules/connectors/ms365-planner/src/index.ts`
- Modify: `modules/products/planner/src/index.ts`
- Modify: `modules/products/planner/src/tools/write/create_plan.commit.ts`
- Modify: `modules/products/planner/src/tools/write/complete_tasks.commit.ts`
- Modify: `modules/products/planner/src/tools/write/_classify.ts`
- Modify: `modules/products/planner/src/tools/write/create_tasks.commit.ts`
- Modify: `modules/products/planner/src/tools/write/update_tasks.commit.ts`

- [ ] **Step 1: Add type re-exports to connector-ms365-planner index**

In `modules/connectors/ms365-planner/src/index.ts`, add this line at the end of the existing exports:

```ts
export type { BatchRequest, BatchResponseItem, GraphFetch } from '@seta/ms-graph'
```

Full file after change:
```ts
export type { PlannerCache, PlannerCacheDeps, ReadResult, ReadSource } from './cache'
export { createPlannerCache } from './cache'
export type { CreateTaskInput, PlannerClient, TaskUpdate } from './client'
export { createPlannerClient } from './client'
export { createEtagStore } from './etag'
export { plannerConnector } from './manifest'
export * from './schema'
export type { PlannerSyncWorker, PlannerSyncWorkerDeps } from './sync'
export { createPlannerSyncWorker } from './sync'
export type { BatchRequest, BatchResponseItem, GraphFetch } from '@seta/ms-graph'
```

- [ ] **Step 2: Update all planner tool imports to use connector, not ms-graph**

In `modules/products/planner/src/index.ts`, change line 3:
```ts
// Before:
import type { GraphFetch } from '@seta/ms-graph'

// After:
import type { GraphFetch } from '@seta/connector-ms365-planner'
```

In `modules/products/planner/src/tools/write/create_plan.commit.ts`, change line 3:
```ts
// Before:
import type { GraphFetch } from '@seta/ms-graph'

// After:
import type { GraphFetch } from '@seta/connector-ms365-planner'
```

In `modules/products/planner/src/tools/write/complete_tasks.commit.ts`, change line 3:
```ts
// Before:
import type { BatchRequest } from '@seta/ms-graph'

// After:
import type { BatchRequest } from '@seta/connector-ms365-planner'
```

In `modules/products/planner/src/tools/write/_classify.ts`, change line 1:
```ts
// Before:
import type { BatchResponseItem } from '@seta/ms-graph'

// After:
import type { BatchResponseItem } from '@seta/connector-ms365-planner'
```

In `modules/products/planner/src/tools/write/create_tasks.commit.ts`, change line 3:
```ts
// Before:
import type { BatchRequest } from '@seta/ms-graph'

// After:
import type { BatchRequest } from '@seta/connector-ms365-planner'
```

In `modules/products/planner/src/tools/write/update_tasks.commit.ts`, change line 3:
```ts
// Before:
import type { BatchRequest, GraphFetch } from '@seta/ms-graph'

// After:
import type { BatchRequest, GraphFetch } from '@seta/connector-ms365-planner'
```

- [ ] **Step 3: Remove @seta/ms-graph from planner's package.json**

Run:
```bash
pnpm --filter @seta/planner remove @seta/ms-graph
```

- [ ] **Step 4: Verify typecheck passes**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add modules/connectors/ms365-planner/src/index.ts \
        modules/products/planner/src/index.ts \
        modules/products/planner/src/tools/write/ \
        modules/products/planner/package.json \
        pnpm-lock.yaml
git commit -m "fix(planner): source ms-graph types from connector, not ms-graph directly

Products must not import platform adapters directly. Re-export
GraphFetch/BatchRequest/BatchResponseItem from connector-ms365-planner
so planner tools no longer depend on @seta/ms-graph."
```

---

### Task 2: Add connector read-model query functions for planner

**Files:**
- Create: `modules/connectors/ms365-planner/src/queries.ts`
- Modify: `modules/connectors/ms365-planner/src/index.ts`

- [ ] **Step 1: Create queries.ts in the planner connector**

Create `modules/connectors/ms365-planner/src/queries.ts`:

```ts
type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>

export async function queryVisiblePlanIds(
  sql: Sql,
  tenantId: string,
  userId: string | undefined,
): Promise<string[]> {
  if (!userId) return []
  const rows = (await sql`
    SELECT DISTINCT plan_id
    FROM connector_ms365_planner.plan_members
    WHERE tenant_id = ${tenantId} AND user_id = ${userId}
  `) as Array<{ plan_id: string }>
  return rows.map((r) => r.plan_id)
}

export async function queryPlanTitle(
  sql: Sql,
  tenantId: string,
  planId: string,
): Promise<string | null> {
  const rows = (await sql`
    SELECT title FROM connector_ms365_planner.planner_plans_cache
    WHERE graph_plan_id = ${planId} AND tenant_id = ${tenantId} LIMIT 1
  `) as Array<{ title: string }>
  return rows[0]?.title ?? null
}

export async function queryPlanTitles(
  sql: Sql,
  tenantId: string,
  planIds: string[],
): Promise<Map<string, string>> {
  if (planIds.length === 0) return new Map()
  const rows = (await sql`
    SELECT graph_plan_id, title
    FROM connector_ms365_planner.planner_plans_cache
    WHERE tenant_id = ${tenantId} AND graph_plan_id = ANY(${planIds}::text[])
  `) as Array<{ graph_plan_id: string; title: string }>
  return new Map(rows.map((r) => [r.graph_plan_id, r.title]))
}

export async function queryTaskCountByStatus(
  sql: Sql,
  tenantId: string,
  planIds: string[],
): Promise<Array<{ percent_complete: number; count: number }>> {
  if (planIds.length === 0) return []
  return (await sql`
    SELECT percent_complete, COUNT(*)::int AS count
    FROM connector_ms365_planner.planner_tasks_cache
    WHERE tenant_id = ${tenantId}
      AND plan_id = ANY(${planIds}::text[])
      AND soft_deleted_at IS NULL
    GROUP BY percent_complete
    ORDER BY percent_complete
  `) as Array<{ percent_complete: number; count: number }>
}

export async function queryUnassignedTasks(
  sql: Sql,
  tenantId: string,
  planIds: string[],
  limit: number,
): Promise<Array<Record<string, unknown>>> {
  if (planIds.length === 0) return []
  return (await sql`
    SELECT graph_task_id, title, plan_id, due_date
    FROM connector_ms365_planner.planner_tasks_cache
    WHERE tenant_id = ${tenantId}
      AND plan_id = ANY(${planIds}::text[])
      AND percent_complete < 100
      AND (assignee_ids IS NULL OR array_length(assignee_ids, 1) IS NULL)
      AND soft_deleted_at IS NULL
    ORDER BY due_date NULLS LAST
    LIMIT ${limit}
  `) as Array<Record<string, unknown>>
}

export async function queryDueSoonTasks(
  sql: Sql,
  tenantId: string,
  planIds: string[],
  soonDate: Date,
  limit: number,
): Promise<Array<Record<string, unknown>>> {
  if (planIds.length === 0) return []
  return (await sql`
    SELECT graph_task_id, title, plan_id, due_date, assignee_ids, percent_complete
    FROM connector_ms365_planner.planner_tasks_cache
    WHERE tenant_id = ${tenantId}
      AND plan_id = ANY(${planIds}::text[])
      AND percent_complete < 100
      AND due_date <= ${soonDate}
      AND soft_deleted_at IS NULL
    ORDER BY due_date
    LIMIT ${limit}
  `) as Array<Record<string, unknown>>
}

export async function queryCompletionRate(
  sql: Sql,
  tenantId: string,
  planIds: string[],
  limit: number,
): Promise<Array<Record<string, unknown>>> {
  if (planIds.length === 0) return []
  return (await sql`
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
      AND plan_id = ANY(${planIds}::text[])
      AND soft_deleted_at IS NULL
    GROUP BY plan_id ORDER BY rate_pct DESC
    LIMIT ${limit}
  `) as Array<Record<string, unknown>>
}

export async function queryBlockedTasks(
  sql: Sql,
  tenantId: string,
  planIds: string[],
  staleThreshold: Date,
  limit: number,
): Promise<Array<Record<string, unknown>>> {
  if (planIds.length === 0) return []
  return (await sql`
    SELECT graph_task_id, title, plan_id, last_modified_at_graph, assignee_ids
    FROM connector_ms365_planner.planner_tasks_cache
    WHERE tenant_id = ${tenantId}
      AND plan_id = ANY(${planIds}::text[])
      AND percent_complete BETWEEN 1 AND 99
      AND last_modified_at_graph < ${staleThreshold}
      AND soft_deleted_at IS NULL
    ORDER BY last_modified_at_graph
    LIMIT ${limit}
  `) as Array<Record<string, unknown>>
}
```

- [ ] **Step 2: Export new query functions from connector index**

Add to `modules/connectors/ms365-planner/src/index.ts`:
```ts
export {
  queryBlockedTasks,
  queryCompletionRate,
  queryDueSoonTasks,
  queryPlanTitle,
  queryPlanTitles,
  queryTaskCountByStatus,
  queryUnassignedTasks,
  queryVisiblePlanIds,
} from './queries'
```

- [ ] **Step 3: Commit**

```bash
git add modules/connectors/ms365-planner/src/queries.ts \
        modules/connectors/ms365-planner/src/index.ts
git commit -m "feat(connector-ms365-planner): add read-model query API

Extract schema-level SQL into typed query functions so downstream
products (analytics) don't need to write raw SQL into this connector's
tables."
```

---

### Task 3: Add directory query functions to connector-ms365-directory

**Files:**
- Create: `modules/connectors/ms365-directory/src/queries.ts`
- Modify: `modules/connectors/ms365-directory/src/index.ts`

- [ ] **Step 1: Create queries.ts in the directory connector**

Create `modules/connectors/ms365-directory/src/queries.ts`:

```ts
type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>

export async function queryDisplayNames(
  sql: Sql,
  tenantId: string,
  userIds: string[],
): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map()
  const rows = (await sql`
    SELECT entra_object_id, display_name
    FROM connector_ms365_directory.directory_users
    WHERE tenant_id = ${tenantId}
      AND entra_object_id = ANY(${userIds}::text[])
  `) as Array<{ entra_object_id: string; display_name: string }>
  return new Map(rows.map((r) => [r.entra_object_id, r.display_name]))
}

export async function queryDirectReports(
  sql: Sql,
  tenantId: string,
  managerId: string,
): Promise<string[]> {
  const rows = (await sql`
    SELECT entra_object_id
    FROM connector_ms365_directory.directory_users
    WHERE manager_id = ${managerId} AND tenant_id = ${tenantId}
  `) as Array<{ entra_object_id: string }>
  return rows.map((r) => r.entra_object_id)
}
```

- [ ] **Step 2: Export from directory connector index**

Replace `modules/connectors/ms365-directory/src/index.ts`:
```ts
export { directoryConnector } from './manifest'
export { queryDirectReports, queryDisplayNames } from './queries'
export * from './schema'
```

- [ ] **Step 3: Commit**

```bash
git add modules/connectors/ms365-directory/src/queries.ts \
        modules/connectors/ms365-directory/src/index.ts
git commit -m "feat(connector-ms365-directory): add read-model query API

Expose queryDisplayNames and queryDirectReports so analytics product
doesn't query the directory schema directly."
```

---

### Task 4: Rewrite analytics tools to use connector query functions

**Files:**
- Modify: `modules/products/analytics/src/tools/tasks_by_status.ts`
- Modify: `modules/products/analytics/src/tools/workload_by_assignee.ts`
- Modify: `modules/products/analytics/src/tools/tasks_by_plan.ts`
- Modify: `modules/products/analytics/src/tools/query_analytics.ts`

- [ ] **Step 1: Rewrite tasks_by_status.ts**

Replace the entire file `modules/products/analytics/src/tools/tasks_by_status.ts`:

```ts
import type { Tool } from '@seta/agent-core'
import {
  queryPlanTitle,
  queryTaskCountByStatus,
  queryVisiblePlanIds,
} from '@seta/connector-ms365-planner'
import { tenantContext } from '@seta/tenant'
import { z } from 'zod'
import type { AnalyticsToolDeps } from './workload_by_assignee'

const Input = z.object({ planId: z.string().optional() })
const Output = z.object({
  rows: z.array(
    z.object({
      status: z.enum(['not_started', 'in_progress', 'completed']),
      count: z.number(),
    }),
  ),
  planName: z.string().nullable(),
})

export function tasksByStatusTool(
  deps: AnalyticsToolDeps,
): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'analytics.tasks_by_status',
    description: 'Count tasks grouped by status. Use for "how many in progress vs done".',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { readOnlyHint: true, idempotentHint: true },
    async execute(input, _ctx) {
      try {
        const tenantId = tenantContext.getTenantId()
        const userId = tenantContext.getUserId()

        const visiblePlanIds = await queryVisiblePlanIds(deps.sql, tenantId, userId)

        if (visiblePlanIds.length === 0) return { ok: true, value: { rows: [], planName: null } }

        const scopedIds = input.planId
          ? [input.planId].filter((id) => visiblePlanIds.includes(id))
          : visiblePlanIds
        if (input.planId && scopedIds.length === 0) {
          return {
            ok: false,
            error: { name: 'Forbidden', message: 'Plan not in your visible set' },
          }
        }

        const rawRows = await queryTaskCountByStatus(deps.sql, tenantId, scopedIds)

        const counts: Record<string, number> = { not_started: 0, in_progress: 0, completed: 0 }
        for (const r of rawRows) {
          const s: 'not_started' | 'in_progress' | 'completed' =
            r.percent_complete === 0
              ? 'not_started'
              : r.percent_complete === 100
                ? 'completed'
                : 'in_progress'
          counts[s] = (counts[s] ?? 0) + Number(r.count)
        }

        const rows = (['not_started', 'in_progress', 'completed'] as const).map((s) => ({
          status: s,
          count: counts[s] ?? 0,
        }))

        const planName = input.planId
          ? await queryPlanTitle(deps.sql, tenantId, input.planId)
          : null

        return { ok: true, value: { rows, planName } }
      } catch (e) {
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}
```

- [ ] **Step 2: Rewrite workload_by_assignee.ts**

Replace the entire file `modules/products/analytics/src/tools/workload_by_assignee.ts`:

```ts
import type { Tool } from '@seta/agent-core'
import { queryDisplayNames } from '@seta/connector-ms365-directory'
import { queryPlanTitle, queryVisiblePlanIds } from '@seta/connector-ms365-planner'
import { tenantContext } from '@seta/tenant'
import { z } from 'zod'

type DbSql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>

export interface AnalyticsToolDeps {
  sql: DbSql
}

const Input = z.object({
  planId: z.string().optional(),
  lookbackDays: z.number().int().min(1).max(90).default(7),
  limit: z.number().min(1).max(50).default(20),
})

const RowSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  openTasks: z.number(),
  overdueTasks: z.number(),
  dueThisWeek: z.number(),
  completedThisWeek: z.number(),
})

const Output = z.object({
  rows: z.array(RowSchema),
  planName: z.string().nullable(),
})

interface WorkloadRow {
  user_id: string
  plan_id: string
  tenant_id: string
  open_tasks: number
  overdue_tasks: number
  due_this_week: number
  completed_this_week: number
}

export function workloadByAssigneeTool(
  deps: AnalyticsToolDeps,
): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'analytics.workload_by_assignee',
    description:
      'Aggregate task workload per assignee. Use for "who is overloaded", "team capacity".',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { readOnlyHint: true, idempotentHint: true },
    async execute(input, _ctx) {
      try {
        const tenantId = tenantContext.getTenantId()
        const userId = tenantContext.getUserId()

        const visiblePlanIds = await queryVisiblePlanIds(deps.sql, tenantId, userId)

        if (visiblePlanIds.length === 0) return { ok: true, value: { rows: [], planName: null } }

        const scopedPlanIds = input.planId
          ? [input.planId].filter((id) => visiblePlanIds.includes(id))
          : visiblePlanIds
        if (input.planId && scopedPlanIds.length === 0) {
          return {
            ok: false,
            error: { name: 'Forbidden', message: 'Plan not in your visible set' },
          }
        }

        const rawRows = (await deps.sql`
          SELECT user_id, plan_id, tenant_id, open_tasks, overdue_tasks, due_this_week, completed_this_week
          FROM analytics.mv_assignee_workload
          WHERE tenant_id = ${tenantId} AND plan_id = ANY(${scopedPlanIds}::text[])
          ORDER BY open_tasks DESC
          LIMIT ${input.limit}
        `) as WorkloadRow[]

        const userIds = [...new Set(rawRows.map((r) => r.user_id))]
        const nameMap = await queryDisplayNames(deps.sql, tenantId, userIds)

        const rows = rawRows.map((r) => ({
          userId: r.user_id,
          displayName: nameMap.get(r.user_id) ?? r.user_id,
          openTasks: Number(r.open_tasks),
          overdueTasks: Number(r.overdue_tasks),
          dueThisWeek: Number(r.due_this_week),
          completedThisWeek: Number(r.completed_this_week),
        }))

        const planName = input.planId
          ? await queryPlanTitle(deps.sql, tenantId, input.planId)
          : null

        return { ok: true, value: { rows, planName } }
      } catch (e) {
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}
```

- [ ] **Step 3: Rewrite tasks_by_plan.ts**

Replace the entire file `modules/products/analytics/src/tools/tasks_by_plan.ts`:

```ts
import type { Tool } from '@seta/agent-core'
import { queryPlanTitles, queryVisiblePlanIds } from '@seta/connector-ms365-planner'
import { tenantContext } from '@seta/tenant'
import { z } from 'zod'
import type { AnalyticsToolDeps } from './workload_by_assignee'

const Input = z.object({
  metric: z.enum(['open', 'overdue', 'completed_this_week']).default('open'),
  limit: z.number().min(1).max(20).default(10),
})

const Output = z.object({
  rows: z.array(
    z.object({
      planId: z.string(),
      planName: z.string(),
      count: z.number(),
    }),
  ),
})

export function tasksByPlanTool(
  deps: AnalyticsToolDeps,
): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'analytics.tasks_by_plan',
    description:
      'Count tasks per plan. Use for "which plan has the most open tasks", "overdue by plan".',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { readOnlyHint: true, idempotentHint: true },
    async execute(input, _ctx) {
      try {
        const tenantId = tenantContext.getTenantId()
        const userId = tenantContext.getUserId()

        const visiblePlanIds = await queryVisiblePlanIds(deps.sql, tenantId, userId)

        if (visiblePlanIds.length === 0) return { ok: true, value: { rows: [] } }

        let rawRows: Array<{ plan_id: string; count: number }>
        if (input.metric === 'open') {
          rawRows = (await deps.sql`
            SELECT plan_id, SUM(open_tasks)::int AS count
            FROM analytics.mv_assignee_workload
            WHERE tenant_id = ${tenantId} AND plan_id = ANY(${visiblePlanIds}::text[])
            GROUP BY plan_id ORDER BY count DESC LIMIT ${input.limit}
          `) as Array<{ plan_id: string; count: number }>
        } else if (input.metric === 'overdue') {
          rawRows = (await deps.sql`
            SELECT plan_id, SUM(overdue_tasks)::int AS count
            FROM analytics.mv_assignee_workload
            WHERE tenant_id = ${tenantId} AND plan_id = ANY(${visiblePlanIds}::text[])
            GROUP BY plan_id ORDER BY count DESC LIMIT ${input.limit}
          `) as Array<{ plan_id: string; count: number }>
        } else {
          rawRows = (await deps.sql`
            SELECT plan_id, SUM(completed_this_week)::int AS count
            FROM analytics.mv_assignee_workload
            WHERE tenant_id = ${tenantId} AND plan_id = ANY(${visiblePlanIds}::text[])
            GROUP BY plan_id ORDER BY count DESC LIMIT ${input.limit}
          `) as Array<{ plan_id: string; count: number }>
        }

        const planNameMap = await queryPlanTitles(deps.sql, tenantId, rawRows.map((r) => r.plan_id))

        const rows = rawRows.map((r) => ({
          planId: r.plan_id,
          planName: planNameMap.get(r.plan_id) ?? r.plan_id,
          count: Number(r.count),
        }))

        return { ok: true, value: { rows } }
      } catch (e) {
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}
```

- [ ] **Step 4: Rewrite query_analytics.ts**

Replace the entire file `modules/products/analytics/src/tools/query_analytics.ts`:

```ts
import type { Tool } from '@seta/agent-core'
import { queryDirectReports } from '@seta/connector-ms365-directory'
import {
  queryBlockedTasks,
  queryCompletionRate,
  queryDueSoonTasks,
  queryUnassignedTasks,
  queryVisiblePlanIds,
} from '@seta/connector-ms365-planner'
import { tenantContext } from '@seta/tenant'
import { LRUCache } from 'lru-cache'
import { z } from 'zod'
import type { AnalyticsToolDeps } from './workload_by_assignee'

const Input = z.object({
  metric: z.enum([
    'workload_by_assignee',
    'blocked_tasks',
    'completion_rate',
    'due_soon',
    'velocity',
    'capacity_forecast',
    'overdue_by_plan',
    'unassigned_tasks',
  ]),
  scope: z.object({
    type: z.enum(['self', 'direct_reports', 'plan', 'org']),
    planId: z.string().optional(),
    userId: z.string().optional(),
  }),
  timeRange: z.object({ from: z.string(), to: z.string() }).optional(),
  groupBy: z.enum(['assignee', 'plan', 'week', 'status']).optional(),
  limit: z.number().min(1).max(100).default(20),
})

const Output = z.object({
  rows: z.array(z.record(z.string(), z.unknown())),
  metadata: z.object({ metric: z.string(), scope: z.string(), rowCount: z.number() }),
})

const cache = new LRUCache<string, z.infer<typeof Output>>({ max: 200, ttl: 5 * 60 * 1000 })

export function queryAnalyticsTool(
  deps: AnalyticsToolDeps,
): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'analytics.query_analytics',
    description:
      'Flexible analytics DSL — velocity, completion rate, workload, blocked tasks, due-soon. For trend queries.',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { readOnlyHint: true, idempotentHint: true },
    async execute(input, _ctx) {
      try {
        const tenantId = tenantContext.getTenantId()
        const userId = tenantContext.getUserId()
        const cacheKey = `analytics:${tenantId}:${userId}:${JSON.stringify(input)}`

        const cached = cache.get(cacheKey)
        if (cached) return { ok: true, value: cached }

        const visiblePlanIds = await queryVisiblePlanIds(deps.sql, tenantId, userId)

        let scopedPlanIds = visiblePlanIds
        if (input.scope.type === 'plan') {
          if (!input.scope.planId) {
            return {
              ok: false,
              error: { name: 'BadRequest', message: 'scope.planId required for scope.type=plan' },
            }
          }
          if (!visiblePlanIds.includes(input.scope.planId)) {
            return {
              ok: false,
              error: { name: 'Forbidden', message: 'Plan not in your visible set' },
            }
          }
          scopedPlanIds = [input.scope.planId]
        } else if (input.scope.type === 'direct_reports') {
          if (!userId) {
            return { ok: false, error: { name: 'Forbidden', message: 'No direct reports found' } }
          }
          const reports = await queryDirectReports(deps.sql, tenantId, userId)
          if (reports.length === 0) {
            return { ok: false, error: { name: 'Forbidden', message: 'No direct reports found' } }
          }
        }

        const from = input.timeRange?.from
          ? new Date(input.timeRange.from)
          : new Date(Date.now() - 30 * 86400_000)
        const to = input.timeRange?.to ? new Date(input.timeRange.to) : new Date()

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
        } else if (input.metric === 'capacity_forecast') {
          rows = (await deps.sql`
            SELECT user_id, SUM(open_tasks)::int AS open, SUM(completed_this_week)::int AS completed_this_week
            FROM analytics.mv_assignee_workload
            WHERE tenant_id = ${tenantId} AND plan_id = ANY(${scopedPlanIds}::text[])
            GROUP BY user_id ORDER BY open DESC LIMIT ${input.limit}
          `) as Array<Record<string, unknown>>
        } else if (input.metric === 'unassigned_tasks') {
          rows = await queryUnassignedTasks(deps.sql, tenantId, scopedPlanIds, input.limit)
        } else if (input.metric === 'due_soon') {
          const soonDate = new Date(Date.now() + 3 * 86400_000)
          rows = await queryDueSoonTasks(deps.sql, tenantId, scopedPlanIds, soonDate, input.limit)
        } else if (input.metric === 'completion_rate') {
          rows = await queryCompletionRate(deps.sql, tenantId, scopedPlanIds, input.limit)
        } else if (input.metric === 'blocked_tasks') {
          const staleThreshold = new Date(Date.now() - 3 * 86400_000)
          rows = await queryBlockedTasks(deps.sql, tenantId, scopedPlanIds, staleThreshold, input.limit)
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

- [ ] **Step 5: Verify typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add modules/products/analytics/src/tools/
git commit -m "fix(analytics): remove cross-schema SQL, use connector read-model API

Analytics tools must not query connector schemas directly. Replace all
connector_ms365_planner.* and connector_ms365_directory.* raw SQL with
typed query functions from the respective connectors."
```

---

### Task 5: Extract business logic from apps/api/main.ts

**Files:**
- Modify: `platform/tenant/src/service.ts` (new file)
- Modify: `platform/tenant/src/index.ts`
- Modify: `modules/products/analytics/src/index.ts`
- Modify: `apps/api/src/main.ts`

- [ ] **Step 1: Create tenant service functions**

Create `platform/tenant/src/service.ts`:

```ts
type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>
type SqlTransaction = Sql & { begin: (fn: (tx: Sql) => Promise<void>) => Promise<void> }

export async function isConnectorConsented(
  sql: Sql,
  tenantId: string,
  connectorId: string,
): Promise<boolean> {
  const rows = (await sql`
    SELECT 1 AS ok FROM tenant.tenant_connectors
    WHERE tenant_id = ${tenantId}
      AND connector_id = ${connectorId}
      AND status = 'active'
    LIMIT 1
  `) as Array<{ ok: number }>
  return rows.length > 0
}

export async function getActiveTenantIds(sql: Sql): Promise<string[]> {
  const rows = (await sql`
    SELECT DISTINCT id::text FROM tenant.tenants WHERE status = 'active'
  `) as Array<{ id: string }>
  return rows.map((r) => r.id)
}

export async function recordConsent(
  sql: SqlTransaction,
  input: {
    tenantId: string
    connectorIds: string[]
    scopesGranted: { delegated: string[]; application: string[] }
  },
): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO tenant.tenants (id, slug, display_name, status)
      VALUES (${input.tenantId}, ${`t-${input.tenantId}`}, ${input.tenantId}, 'active')
      ON CONFLICT (id) DO NOTHING
    `
    for (const connectorId of input.connectorIds) {
      await tx`
        INSERT INTO tenant.tenant_connectors
          (tenant_id, connector_id, status, consented_at, scope_set)
        VALUES (${input.tenantId}, ${connectorId}, 'active', now(), ${JSON.stringify(input.scopesGranted)}::jsonb)
        ON CONFLICT (tenant_id, connector_id) DO UPDATE
          SET status       = 'active',
              consented_at = excluded.consented_at,
              scope_set    = excluded.scope_set,
              updated_at   = now()
      `
    }
  })
}
```

- [ ] **Step 2: Export from tenant index**

Add to `platform/tenant/src/index.ts`:
```ts
export type { TenantContextStore } from './context'
export { tenantContext } from './context'
export { tenantMiddleware } from './middleware'
export * from './schema'
export { getActiveTenantIds, isConnectorConsented, recordConsent } from './service'
```

- [ ] **Step 3: Add refreshAnalyticsViews to analytics**

Add to `modules/products/analytics/src/index.ts`:

```ts
import type { Tool } from '@seta/agent-core'
import { queryAnalyticsTool } from './tools/query_analytics'
import { tasksByPlanTool } from './tools/tasks_by_plan'
import { tasksByStatusTool } from './tools/tasks_by_status'
import type { AnalyticsToolDeps } from './tools/workload_by_assignee'
import { workloadByAssigneeTool } from './tools/workload_by_assignee'

export type { ChartSeries, ChartYBarData } from './cards/chart-ybar'
export { chartYBarCard } from './cards/chart-ybar'
export { analyticsSchema } from './schema'
export { ANALYTICS_PROFILE_SEED, ANALYTICS_SLUG, ANALYTICS_TOOL_IDS } from './seeds/analytics'

export function createAnalyticsTools(deps: AnalyticsToolDeps): Record<string, Tool> {
  const tools = [
    workloadByAssigneeTool(deps),
    tasksByStatusTool(deps),
    tasksByPlanTool(deps),
    queryAnalyticsTool(deps),
  ]
  return Object.fromEntries(tools.map((t) => [t.id, t])) as Record<string, Tool>
}

export async function refreshAnalyticsViews(
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>,
): Promise<void> {
  await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_assignee_workload`
  await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_plan_weekly_velocity`
}
```

- [ ] **Step 4: Simplify apps/api/src/main.ts — remove all inline SQL and domain logic**

In `apps/api/src/main.ts`, make these changes:

**Add imports** at the top (after existing imports):
```ts
import { refreshAnalyticsViews } from '@seta/analytics'
import { getActiveTenantIds, isConnectorConsented, recordConsent } from '@seta/tenant'
```

**Replace the `createConnectorRegistry` call** (lines 46–55):
```ts
// Before:
const registry = createConnectorRegistry(async (tenantId, connectorId) => {
  const rows = await sql<Array<{ ok: number }>>`
    SELECT 1 AS ok FROM tenant.tenant_connectors
     WHERE tenant_id = ${tenantId}
       AND connector_id = ${connectorId}
       AND status = 'active'
     LIMIT 1
  `
  return rows.length > 0
})

// After:
const registry = createConnectorRegistry(async (tenantId, connectorId) =>
  isConnectorConsented(sql, tenantId, connectorId),
)
```

**Replace `onConsented` callback** in `createOAuthRoutes`:
```ts
// Before:
onConsented: async ({ tenantId, connectorIds, scopesGranted }) => {
  await sql.begin(async (tx) => {
    await tx`INSERT INTO tenant.tenants ...`
    for (const connectorId of connectorIds) {
      await tx`INSERT INTO tenant.tenant_connectors ...`
    }
  })
},

// After:
onConsented: async ({ tenantId, connectorIds, scopesGranted }) =>
  recordConsent(sql as never, { tenantId, connectorIds, scopesGranted }),
```

**Replace `getActiveTenantIds` inline function** (inside `boot()`):
```ts
// Before:
const getActiveTenantIds = async (): Promise<string[]> => {
  const rows = (await sql`
    SELECT DISTINCT tenant_id::text FROM tenant.tenants WHERE status = 'active'
  `) as Array<{ tenant_id: string }>
  return rows.map((r) => r.tenant_id)
}

// After (just use the import directly):
// (delete the local function; use `getActiveTenantIds(sql)` directly below)
```

**Replace `afterSync` callback** in `createPlannerSyncWorker`:
```ts
// Before:
afterSync: async (tenantId, changedTaskIds) => {
  if (changedTaskIds.length > 0) {
    await taskIndexer.indexTasks(tenantId, changedTaskIds)
  }
  await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_assignee_workload`
  await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_plan_weekly_velocity`
},

// After:
afterSync: async (tenantId, changedTaskIds) => {
  if (changedTaskIds.length > 0) {
    await taskIndexer.indexTasks(tenantId, changedTaskIds)
  }
  await refreshAnalyticsViews(sql)
},
```

**Replace `getActiveTenantIds()` call** in `boot()`:
```ts
// Before:
const tenantIds = await getActiveTenantIds()

// After:
const tenantIds = await getActiveTenantIds(sql)
```

- [ ] **Step 5: Verify typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add platform/tenant/src/service.ts platform/tenant/src/index.ts \
        modules/products/analytics/src/index.ts apps/api/src/main.ts
git commit -m "fix(api): extract business logic from main.ts into domain modules

apps/api is composition-only. Move tenant consent management to
@seta/tenant, analytics view refresh to @seta/analytics. No raw SQL
against domain schemas in main.ts."
```

---

## Category 2 — Missing Structured Logging

### Task 6: Replace console.error in middleware error handler

**Files:**
- Modify: `platform/middleware/src/errors.ts`

- [ ] **Step 1: Replace console.error with structured logger**

In `platform/middleware/src/errors.ts`, add import and replace `console.error`:

Add at the top (after existing imports):
```ts
import { logger } from '@seta/observability'
```

Replace line 106:
```ts
// Before:
console.error('[onError] unhandled error', err)

// After:
logger.error({ err }, '[onError] unhandled error')
```

- [ ] **Step 2: Verify**

```bash
pnpm typecheck && pnpm test:unit
```

Expected: no errors, tests pass.

- [ ] **Step 3: Commit**

```bash
git add platform/middleware/src/errors.ts
git commit -m "fix(middleware): replace console.error with structured logger in onError"
```

---

### Task 7: Add logging to connector-ms365-planner

**Files:**
- Modify: `modules/connectors/ms365-planner/src/client.ts`
- Modify: `modules/connectors/ms365-planner/src/cache.ts`

- [ ] **Step 1: Add logger to planner client**

In `modules/connectors/ms365-planner/src/client.ts`, add after the existing imports:

```ts
import { logger } from '@seta/observability'
```

Add a module-level logger:
```ts
const log = logger.child({ component: 'planner-client' })
```

Modify the `createPlannerClient` return to log errors. Update the `createTask`, `updateTask`, `deleteTask` methods to log on success:
```ts
createTask: async (input) => {
  const r = await deps.graph.call({
    ...base,
    method: 'POST',
    path: '/planner/tasks',
    body: input,
  })
  log.info({ planId: input.planId, title: input.title }, 'planner.createTask')
  return { data: r.data, etag: r.etag }
},
updateTask: async (id, etag, patch) => {
  const r = await deps.graph.call({
    ...base,
    method: 'PATCH',
    path: `/planner/tasks/${id}`,
    etag,
    headers: { Prefer: 'return=representation' },
    body: patch,
  })
  log.info({ taskId: id }, 'planner.updateTask')
  return { data: r.data, etag: r.etag }
},
deleteTask: async (id, etag) => {
  await deps.graph.call({ ...base, method: 'DELETE', path: `/planner/tasks/${id}`, etag })
  log.info({ taskId: id }, 'planner.deleteTask')
},
```

- [ ] **Step 2: Add logger to planner cache**

In `modules/connectors/ms365-planner/src/cache.ts`, add import and module logger:

```ts
import { logger } from '@seta/observability'
```

```ts
const log = logger.child({ component: 'planner-cache' })
```

In the `createEntityCache` function's `one` method, add cache hit/miss logging:
```ts
async one(id: string): Promise<ReadResult<T> | null> {
  // existing query logic...
  if (row && ageSeconds <= staleFallbackMaxSec) {
    if (ageSeconds <= ttlSec) {
      log.debug({ id, ageSeconds }, 'cache.hit')
      return { data: row.raw as T, source: 'cache:fresh', ageSeconds }
    }
    // stale fallback attempt...
    log.warn({ id, ageSeconds }, 'cache.stale-fallback')
    // ...
  }
  log.debug({ id }, 'cache.miss')
  // live fetch...
},
```

- [ ] **Step 3: Verify**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add modules/connectors/ms365-planner/src/client.ts \
        modules/connectors/ms365-planner/src/cache.ts
git commit -m "fix(connector-ms365-planner): add structured logging to client and cache"
```

---

### Task 8: Add logging to teams channel

**Files:**
- Modify: `modules/channels/teams/src/teams-handler.ts`
- Modify: `modules/channels/teams/src/bot-token.ts`
- Modify: `modules/channels/teams/src/reply.ts`

- [ ] **Step 1: Add logger to teams-handler.ts**

In `modules/channels/teams/src/teams-handler.ts`, add after existing imports:
```ts
import { logger } from '@seta/observability'
```

Add module logger:
```ts
const log = logger.child({ component: 'teams-handler' })
```

In the `createTeamsHandler` returned function's execute logic, add:
```ts
// After parsing the activity:
log.info({ type: activity.type, conversationType: activity.conversation.conversationType }, 'teams.activity')

// After slug selection:
log.info({ slug }, 'teams.agent-selected')

// In error handling:
log.error({ err }, 'teams.run-failed')
```

- [ ] **Step 2: Add logger to bot-token.ts**

In `modules/channels/teams/src/bot-token.ts`, add:
```ts
import { logger } from '@seta/observability'

const log = logger.child({ component: 'bot-token' })
```

Add `log.debug({}, 'bot-token.cache-hit')` on cache hit and `log.info({}, 'bot-token.fetched')` after successful fetch.

- [ ] **Step 3: Add logger to reply.ts**

In `modules/channels/teams/src/reply.ts`, add:
```ts
import { logger } from '@seta/observability'

const log = logger.child({ component: 'teams-reply' })
```

Add `log.error({ status: res.status }, 'teams.reply-failed')` before the throw.

- [ ] **Step 4: Verify**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add modules/channels/teams/src/teams-handler.ts \
        modules/channels/teams/src/bot-token.ts \
        modules/channels/teams/src/reply.ts
git commit -m "fix(ms-teams): add structured logging to teams channel"
```

---

### Task 9: Add logging to planner and analytics product tools

**Files:**
- Modify: all files under `modules/products/planner/src/tools/`
- Modify: all files under `modules/products/analytics/src/tools/`

- [ ] **Step 1: Add logger to each planner tool file**

The pattern for every tool file (both read and write) is:

1. Add at the top: `import { logger } from '@seta/observability'`
2. After the import block: `const log = logger.child({ component: '<tool-id>' })`
3. At the start of `execute()`: `log.debug({ tenantId: tenantContext.getTenantId() }, '<tool-id>.start')`
4. In every `catch (e)` block before the return: `log.error({ err: e }, '<tool-id>.failed')`

Apply this pattern to all 20 tool files:

**Read tools:**
- `modules/products/planner/src/tools/read/list_my_tasks.ts` — component: `'planner.list_my_tasks'`
- `modules/products/planner/src/tools/read/list_plan_tasks.ts` — component: `'planner.list_plan_tasks'`
- `modules/products/planner/src/tools/read/get_task.ts` — component: `'planner.get_task'`
- `modules/products/planner/src/tools/read/list_plans.ts` — component: `'planner.list_plans'`
- `modules/products/planner/src/tools/read/list_buckets.ts` — component: `'planner.list_buckets'`
- `modules/products/planner/src/tools/read/search_tasks_semantic.ts` — component: `'planner.search_tasks_semantic'`
- `modules/products/planner/src/tools/read/get_project_status.ts` — component: `'planner.get_project_status'`
- `modules/products/planner/src/tools/read/get_one_on_one_prep.ts` — component: `'planner.get_one_on_one_prep'`

**Write tools:**
- `modules/products/planner/src/tools/write/update_tasks.preview.ts` — component: `'planner.update_tasks.preview'`
- `modules/products/planner/src/tools/write/update_tasks.commit.ts` — component: `'planner.update_tasks.commit'`
- `modules/products/planner/src/tools/write/create_tasks.preview.ts` — component: `'planner.create_tasks.preview'`
- `modules/products/planner/src/tools/write/create_tasks.commit.ts` — component: `'planner.create_tasks.commit'`
- `modules/products/planner/src/tools/write/complete_tasks.preview.ts` — component: `'planner.complete_tasks.preview'`
- `modules/products/planner/src/tools/write/complete_tasks.commit.ts` — component: `'planner.complete_tasks.commit'`
- `modules/products/planner/src/tools/write/add_comments.preview.ts` — component: `'planner.add_comments.preview'`
- `modules/products/planner/src/tools/write/add_comments.commit.ts` — component: `'planner.add_comments.commit'`
- `modules/products/planner/src/tools/write/create_plan.preview.ts` — component: `'planner.create_plan.preview'`
- `modules/products/planner/src/tools/write/create_plan.commit.ts` — component: `'planner.create_plan.commit'`

**Analytics tools:**
- `modules/products/analytics/src/tools/tasks_by_status.ts` — component: `'analytics.tasks_by_status'`
- `modules/products/analytics/src/tools/workload_by_assignee.ts` — component: `'analytics.workload_by_assignee'`
- `modules/products/analytics/src/tools/tasks_by_plan.ts` — component: `'analytics.tasks_by_plan'`
- `modules/products/analytics/src/tools/query_analytics.ts` — component: `'analytics.query_analytics'`

**Example — complete updated `list_my_tasks.ts` showing exactly what to add:**

If the current file starts with:
```ts
import type { Tool } from '@seta/agent-core'
import { tenantContext } from '@seta/tenant'
// ... rest of imports
```

After change it starts with:
```ts
import type { Tool } from '@seta/agent-core'
import { logger } from '@seta/observability'
import { tenantContext } from '@seta/tenant'
// ... rest of imports

const log = logger.child({ component: 'planner.list_my_tasks' })
```

And inside `execute()`:
```ts
async execute(input, _ctx) {
  log.debug({ tenantId: tenantContext.getTenantId() }, 'planner.list_my_tasks.start')
  try {
    // ... existing logic ...
  } catch (e) {
    log.error({ err: e }, 'planner.list_my_tasks.failed')
    return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
  }
}
```

Apply this same pattern to all 22 files listed above.

- [ ] **Step 2: Verify**

```bash
pnpm typecheck && pnpm test:unit
```

Expected: no errors, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add modules/products/planner/src/tools/ modules/products/analytics/src/tools/
git commit -m "fix(planner,analytics): add structured logging to all tool handlers

Every tool now logs entry (debug) and errors (error) using @seta/observability.
This makes tool invocations traceable in production logs."
```

---

## Category 3 — Error Handling

### Task 10: Replace raw Error throws with DomainError subclasses

**Files:**
- Modify: `modules/channels/teams/src/bot-token.ts`
- Modify: `modules/channels/teams/src/reply.ts`
- Modify: `modules/connectors/ms365-planner/src/cache.ts`
- Modify: `platform/directory/src/jit-mapper.ts`
- Modify: `platform/ms-graph/src/graph-fetch.ts`

- [ ] **Step 1: Fix bot-token.ts**

In `modules/channels/teams/src/bot-token.ts`, add import:
```ts
import { ServiceUnavailable } from '@seta/middleware'
```

Replace line 18:
```ts
// Before:
if (!res.ok) throw new Error(`Bot token fetch failed: ${res.status}`)

// After:
if (!res.ok) throw new ServiceUnavailable(`bot token fetch failed: ${res.status}`)
```

- [ ] **Step 2: Fix reply.ts**

In `modules/channels/teams/src/reply.ts`, add import:
```ts
import { ServiceUnavailable } from '@seta/middleware'
```

Replace lines 19–21:
```ts
// Before:
if (!res.ok) {
  throw new Error(`Reply failed: ${res.status} ${await res.text()}`)
}

// After:
if (!res.ok) {
  const body = await res.text()
  throw new ServiceUnavailable(`teams reply failed: ${res.status} ${body}`)
}
```

- [ ] **Step 3: Fix cache.ts**

In `modules/connectors/ms365-planner/src/cache.ts`, add import at the top:
```ts
import { Unprocessable } from '@seta/middleware'
```

Replace the throw in `softDelete` method (line 134):
```ts
// Before:
if (!ops.softDeleteRow) throw new Error('softDelete not supported for this entity')

// After:
if (!ops.softDeleteRow) throw new Unprocessable('softDelete not supported for this entity')
```

- [ ] **Step 4: Fix jit-mapper.ts**

In `platform/directory/src/jit-mapper.ts`, add import:
```ts
import { ServiceUnavailable } from '@seta/middleware'
```

Replace line 47:
```ts
// Before:
if (!u) throw new Error('JIT mapper: upsert returned no row')

// After:
if (!u) throw new ServiceUnavailable('jit-mapper: upsert returned no row')
```

- [ ] **Step 5: Fix graph-fetch.ts**

In `platform/ms-graph/src/graph-fetch.ts`, `BadRequest` is already imported from `@seta/middleware` via `errors.ts`. Check the import and add if missing:
```ts
import { BadRequest } from '@seta/middleware'
```

Replace line 234:
```ts
// Before:
if (requests.length > 20) throw new Error('batch requests must be <= 20')

// After:
if (requests.length > 20) throw new BadRequest('batch requests must be <= 20')
```

- [ ] **Step 6: Verify**

```bash
pnpm typecheck && pnpm test:unit
```

Expected: no errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add modules/channels/teams/src/bot-token.ts \
        modules/channels/teams/src/reply.ts \
        modules/connectors/ms365-planner/src/cache.ts \
        platform/directory/src/jit-mapper.ts \
        platform/ms-graph/src/graph-fetch.ts
git commit -m "fix: replace raw Error throws with DomainError subclasses

Ensures all runtime errors are RFC 7807 formatted and intercepted by
the global onError handler instead of leaking as 500s."
```

---

## Category 4 — `process.env` Hygiene

### Task 11: Validate env vars with Zod in teams manifest build script

**Files:**
- Modify: `modules/channels/teams/src/manifest/build.ts`

- [ ] **Step 1: Read the current file**

```bash
cat modules/channels/teams/src/manifest/build.ts
```

- [ ] **Step 2: Add Zod env validation at the top of build.ts**

Replace the two bare `process.env` reads with a Zod-parsed env block:

```ts
import { z } from 'zod'

const env = z
  .object({
    MS_BOT_ID: z.string().min(1, 'MS_BOT_ID is required'),
    VALID_DOMAINS: z.string().default('localhost'),
  })
  .parse(process.env)

const botId = env.MS_BOT_ID
const domains = env.VALID_DOMAINS
```

Remove the old lines:
```ts
// Delete these:
const botId = process.env.MS_BOT_ID ?? ''
const domains = process.env.VALID_DOMAINS ?? 'localhost'
```

- [ ] **Step 3: Verify**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Add sanctioned-exception comment to logger.ts**

In `platform/observability/src/logger.ts`, add a comment above the `process.env` reads (line ~51):

```ts
// Sanctioned exception: logger bootstraps before env.ts is parsed; reads process.env directly.
level: opts.level ?? (process.env.LOG_LEVEL as pino.LevelWithSilent) ?? 'info',
base: { service: opts.service ?? 'seta-os', env: process.env.NODE_ENV ?? 'development' },
```

- [ ] **Step 5: Commit**

```bash
git add modules/channels/teams/src/manifest/build.ts \
        platform/observability/src/logger.ts
git commit -m "fix(ms-teams): validate manifest build env vars with Zod

Also documents @seta/observability logger as the one sanctioned
exception to the process.env-outside-env.ts rule."
```

---

## Category 5 — `tenantId` as Function Parameter

### Task 12: Remove tenantId param from ConnectorRegistry.requireConsent

**Files:**
- Modify: `platform/connector-registry/src/types.ts`
- Modify: `platform/connector-registry/src/runtime.ts`
- Modify: `apps/api/src/main.ts`

- [ ] **Step 1: Update ConnectorRegistry type**

In `platform/connector-registry/src/types.ts`, update the interface:

```ts
import type { TenantContextStore } from '@seta/tenant'

export type ConnectorDefinition = {
  id: string
  providerId: string
  displayName: string
  description: string
  customerFacingRationale: string
  requiredScopes: { delegated: string[]; application: string[] }
  capabilities: { syncable: boolean; writes: boolean }
}

export interface ConnectorRegistry {
  register(def: ConnectorDefinition): void
  get(id: string): ConnectorDefinition
  list(): ConnectorDefinition[]
  listByProvider(providerId: string): ConnectorDefinition[]
  scopeUnion(connectorIds: string[]): { delegated: string[]; application: string[] }
  /**
   * Throw `ConnectorNotConsented` if this tenant hasn't enabled the connector.
   * Reads tenantId from tenantContext — must be called within a request context.
   */
  requireConsent(connectorId: string): Promise<void>
}
```

- [ ] **Step 2: Update ConnectorRegistry implementation**

In `platform/connector-registry/src/runtime.ts`:

Add import:
```ts
import { tenantContext } from '@seta/tenant'
```

Update `RequireConsentFn` type:
```ts
export type RequireConsentFn = (tenantId: string, connectorId: string) => Promise<boolean>
```

Update `requireConsent` implementation:
```ts
async requireConsent(connectorId) {
  if (!consentCheck) throw new Error('consentCheck not configured')
  const tenantId = tenantContext.getTenantId()
  const ok = await consentCheck(tenantId, connectorId)
  if (!ok) throw new ConnectorNotConsented(tenantId, connectorId)
},
```

Note: `RequireConsentFn` (injected at the composition root) still takes `(tenantId, connectorId)` — it is a DB utility parameter, not a domain parameter. Only the public `requireConsent(connectorId)` method removes the tenantId param.

- [ ] **Step 3: Add @seta/tenant as a dependency of connector-registry**

```bash
pnpm --filter @seta/connector-registry add @seta/tenant@workspace:*
```

- [ ] **Step 4: Update all callers of requireConsent**

In all planner tool files that call `deps.registry.requireConsent(tenantId, 'ms365-planner')`, update to remove the tenantId argument:

```ts
// Before:
await deps.registry.requireConsent(tenantId, 'ms365-planner')

// After:
await deps.registry.requireConsent('ms365-planner')
```

Files to update:
- `modules/products/planner/src/tools/write/create_plan.commit.ts`
- `modules/products/planner/src/tools/write/complete_tasks.commit.ts`
- `modules/products/planner/src/tools/write/create_tasks.commit.ts`
- `modules/products/planner/src/tools/write/update_tasks.commit.ts`
- `modules/products/planner/src/tools/write/add_comments.commit.ts`
- `modules/products/planner/src/tools/write/create_plan.preview.ts`
- `modules/products/planner/src/tools/write/complete_tasks.preview.ts`
- `modules/products/planner/src/tools/write/add_comments.preview.ts`
- `modules/products/planner/src/tools/write/create_tasks.preview.ts`
- `modules/products/planner/src/tools/write/update_tasks.preview.ts`
- `modules/products/planner/src/index.ts` (the `registry` type in `PlannerToolsDeps`)

Update `PlannerToolsDeps` in `modules/products/planner/src/index.ts`:
```ts
// Before:
registry: { requireConsent(tenantId: string, connectorId: string): Promise<void> }

// After:
registry: { requireConsent(connectorId: string): Promise<void> }
```

- [ ] **Step 5: Update main.ts registry consent check call**

The `createConnectorRegistry` call in `apps/api/src/main.ts` still passes the `consentCheck` callback with `(tenantId, connectorId)` — this remains correct because `RequireConsentFn` still takes both params at the infrastructure level. No change needed there.

- [ ] **Step 6: Verify typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add platform/connector-registry/src/types.ts \
        platform/connector-registry/src/runtime.ts \
        platform/connector-registry/package.json \
        pnpm-lock.yaml \
        modules/products/planner/src/
git commit -m "fix(connector-registry): remove tenantId param from requireConsent

requireConsent now reads tenantId from tenantContext internally.
The injected consentCheck callback (infrastructure layer) still
receives tenantId as it operates outside domain context."
```

---

### Task 13: Wrap OAuth callback downstream work in tenantContext.run

**Files:**
- Modify: `platform/oauth/src/routes.ts`

- [ ] **Step 1: Update the callback handler**

In `platform/oauth/src/routes.ts`, add import at the top:
```ts
import { tenantContext } from '@seta/tenant'
```

In the `app.get('/:provider/callback', ...)` handler, after the `tenantId` is confirmed (after line 83 `if (tenantId !== tenantHint) { ... }`), wrap all downstream work in `tenantContext.run`:

```ts
    // After the tid-mismatch check:
    await tenantContext.run({ tenantId }, async () => {
      if (deps.onConsented) {
        await deps.onConsented({
          tenantId,
          connectorIds: stateRow.connectorIds,
          scopesGranted: deps.registry.scopeUnion(stateRow.connectorIds),
        })
      }

      const clientId = (provider as unknown as { cfg: { clientId: string } }).cfg.clientId
      if (deps.vault) {
        await deps.vault.put(tenantId, providerId, `app:${clientId}`, appOnlyBundle)
      }

      await deps.audit?.recordAudit({
        tenantId,
        actor: { type: 'system', label: 'oauth-callback' },
        providerId,
        operation: 'oauth.admin_consent',
        result: 'ok',
        metadata: { connector_ids: stateRow.connectorIds },
      })
    })
```

- [ ] **Step 2: Add @seta/tenant as a dependency of @seta/oauth**

```bash
pnpm --filter @seta/oauth add @seta/tenant@workspace:*
```

- [ ] **Step 3: Verify typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add platform/oauth/src/routes.ts platform/oauth/package.json pnpm-lock.yaml
git commit -m "fix(oauth): wrap consent callback in tenantContext.run

Ensures all downstream consent processing runs within a tenant
context, making tenantContext.getTenantId() available to any
service called from onConsented."
```

---

### Task 14: Wrap sync worker per-tenant iterations in tenantContext.run

**Files:**
- Modify: `modules/connectors/ms365-planner/src/sync.ts`

- [ ] **Step 1: Update afterSync signature and wrap syncTenant**

In `modules/connectors/ms365-planner/src/sync.ts`, update:

1. Add import:
```ts
import { tenantContext } from '@seta/tenant'
```

2. Update `PlannerSyncWorkerDeps.afterSync` signature (remove `tenantId` param):
```ts
export interface PlannerSyncWorkerDeps {
  db: DbSql
  graph: GraphFetch
  getAppToken: (tenantId: string) => Promise<string>
  intervalMs?: number
  afterSync?: (changedTaskIds: string[]) => Promise<void>  // tenantId removed
  onSyncError?: (tenantId: string, err: unknown) => void
}
```

3. Wrap `syncTenant` body in `tenantContext.run`:
```ts
async function syncTenant(tenantId: string): Promise<void> {
  return tenantContext.run({ tenantId }, async () => {
    log.info({ tenantId }, 'sync.start')
    // ... rest of the existing function body unchanged ...
    // The afterSync call becomes:
    if (allChangedTaskIds.length > 0) {
      await afterSync?.(allChangedTaskIds)  // tenantId param removed
    }
  })
}
```

- [ ] **Step 2: Update the afterSync call in apps/api/src/main.ts**

The `afterSync` callback in `main.ts` must be updated to match the new signature:

```ts
// Before:
afterSync: async (tenantId, changedTaskIds) => {
  if (changedTaskIds.length > 0) {
    await taskIndexer.indexTasks(tenantId, changedTaskIds)
  }
  await refreshAnalyticsViews(sql)
},

// After (tenantId read from context):
afterSync: async (changedTaskIds) => {
  const tenantId = tenantContext.getTenantId()
  if (changedTaskIds.length > 0) {
    await taskIndexer.indexTasks(tenantId, changedTaskIds)
  }
  await refreshAnalyticsViews(sql)
},
```

- [ ] **Step 3: Verify typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Final verification of entire codebase**

```bash
pnpm lint && pnpm typecheck && pnpm test:unit
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add modules/connectors/ms365-planner/src/sync.ts apps/api/src/main.ts
git commit -m "fix(connector-ms365-planner): wrap sync worker iterations in tenantContext.run

Each tenant's sync now runs inside tenantContext.run so downstream
services (afterSync, taskIndexer) can read tenantId from context
instead of receiving it as a parameter."
```

---

## Post-completion checklist

- [ ] Run full test suite: `pnpm lint && pnpm typecheck && pnpm test:unit`
- [ ] Confirm no `@seta/ms-graph` in `@seta/planner`'s package.json: `cat modules/products/planner/package.json | grep ms-graph` → should return nothing
- [ ] Confirm no cross-schema SQL in analytics tools: `grep -r "connector_ms365_planner\." modules/products/analytics/src/tools/` → should return nothing
- [ ] Confirm no `console\.` in production src: `grep -r "console\." {modules,platform}/*/src --include="*.ts" | grep -v ".test.ts" | grep -v "demo\|fixture\|scripts"` → only the sanctioned logger exception
- [ ] Confirm no `process\.env\.` in production src outside logger.ts: `grep -r "process\.env\." {modules,platform}/*/src --include="*.ts" | grep -v "drizzle\|test\|\.config\|logger\.ts"` → nothing
