import type { Tool } from '@seta/agent-core'
import { queryPlanTitles, queryVisiblePlanIds } from '@seta/connector-ms365-planner'
import { logger } from '@seta/observability'
import { tenantContext } from '@seta/tenant'
import { z } from 'zod'
import type { AnalyticsToolDeps } from './workload_by_assignee'

const log = logger.child({ component: 'analytics.tasks_by_plan' })

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
        log.debug(
          { tenantId: tenantContext.getTenantIdOrUndefined() },
          'analytics.tasks_by_plan.start',
        )

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

        const planNameMap = await queryPlanTitles(
          deps.sql,
          tenantId,
          rawRows.map((r) => r.plan_id),
        )

        const rows = rawRows.map((r) => ({
          planId: r.plan_id,
          planName: planNameMap.get(r.plan_id) ?? r.plan_id,
          count: Number(r.count),
        }))

        return { ok: true, value: { rows } }
      } catch (e) {
        log.error({ err: e }, 'analytics.tasks_by_plan.failed')
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}
