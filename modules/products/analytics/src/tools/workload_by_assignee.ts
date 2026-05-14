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
