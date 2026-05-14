import type { Tool } from '@seta/agent-core'
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

        const visiblePlanRows = (await deps.sql`
          SELECT DISTINCT plan_id FROM connector_ms365_planner.plan_members
          WHERE tenant_id = ${tenantId} AND user_id = ${userId}
        `) as Array<{ plan_id: string }>
        const visiblePlanIds = visiblePlanRows.map((r) => r.plan_id)

        if (visiblePlanIds.length === 0) return { ok: true, value: { rows: [] } }

        // Use per-metric queries to avoid sql.unsafe() with a dynamic column name
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

        const planIds = rawRows.map((r) => r.plan_id)
        const planRows = (await deps.sql`
          SELECT graph_plan_id, title FROM connector_ms365_planner.planner_plans_cache
          WHERE tenant_id = ${tenantId} AND graph_plan_id = ANY(${planIds}::text[])
        `) as Array<{ graph_plan_id: string; title: string }>

        const planNameMap = new Map(planRows.map((r) => [r.graph_plan_id, r.title]))

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
