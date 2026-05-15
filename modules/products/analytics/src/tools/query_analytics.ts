import type { Tool } from '@seta/agent-core'
import { queryDirectReports } from '@seta/connector-ms365-directory'
import {
  queryBlockedTasks,
  queryCompletionRate,
  queryDueSoonTasks,
  queryUnassignedTasks,
  queryVisiblePlanIds,
} from '@seta/connector-ms365-planner'
import { logger } from '@seta/observability'
import { tenantContext } from '@seta/tenancy'
import { LRUCache } from 'lru-cache'
import { z } from 'zod'
import type { AnalyticsToolDeps } from './workload_by_assignee'

const log = logger.child({ component: 'analytics.query_analytics' })

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
        log.debug(
          { tenantId: tenantContext.getTenantIdOrUndefined() },
          'analytics.query_analytics.start',
        )

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
          rows = await queryBlockedTasks(
            deps.sql,
            tenantId,
            scopedPlanIds,
            staleThreshold,
            input.limit,
          )
        }

        const value: z.infer<typeof Output> = {
          rows,
          metadata: { metric: input.metric, scope: input.scope.type, rowCount: rows.length },
        }
        cache.set(cacheKey, value)
        return { ok: true, value }
      } catch (e) {
        log.error({ err: e }, 'analytics.query_analytics.failed')
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}
