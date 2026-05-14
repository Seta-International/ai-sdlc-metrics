import type { Tool } from '@seta/agent-core'
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

        const visiblePlanRows = (await deps.sql`
          SELECT DISTINCT plan_id FROM connector_ms365_planner.plan_members
          WHERE tenant_id = ${tenantId} AND user_id = ${userId}
        `) as Array<{ plan_id: string }>
        const visiblePlanIds = visiblePlanRows.map((r) => r.plan_id)

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

        const rawRows = (await deps.sql`
          SELECT percent_complete, COUNT(*)::int AS count
          FROM connector_ms365_planner.planner_tasks_cache
          WHERE tenant_id = ${tenantId}
            AND plan_id = ANY(${scopedIds}::text[])
            AND soft_deleted_at IS NULL
          GROUP BY percent_complete
          ORDER BY percent_complete
        `) as Array<{ percent_complete: number; count: number }>

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
