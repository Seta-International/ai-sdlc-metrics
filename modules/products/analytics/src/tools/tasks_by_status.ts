import type { Tool } from '@seta/agent-core'
import {
  queryPlanTitle,
  queryTaskCountByStatus,
  queryVisiblePlanIds,
} from '@seta/connector-ms365-planner'
import { logger } from '@seta/observability'
import { tenantContext } from '@seta/tenancy'
import { z } from 'zod'
import type { AnalyticsToolDeps } from './workload_by_assignee'

const log = logger.child({ component: 'analytics.tasks_by_status' })

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
        log.debug(
          { tenantId: tenantContext.getTenantIdOrUndefined() },
          'analytics.tasks_by_status.start',
        )

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
        log.error({ err: e }, 'analytics.tasks_by_status.failed')
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}
