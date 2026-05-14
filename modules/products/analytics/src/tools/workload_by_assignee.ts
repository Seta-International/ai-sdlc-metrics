import type { Tool } from '@seta/agent-core'
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

        // Fetch visible plan IDs for this user (using plan_members directly — no cross-product import)
        const visiblePlanRows = (await deps.sql`
          SELECT DISTINCT plan_id
          FROM connector_ms365_planner.plan_members
          WHERE tenant_id = ${tenantId} AND user_id = ${userId}
        `) as Array<{ plan_id: string }>
        const visiblePlanIds = visiblePlanRows.map((r) => r.plan_id)

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

        // Resolve display names from directory (one query for all users)
        const userIds = [...new Set(rawRows.map((r) => r.user_id))]
        const dirRows = (await deps.sql`
          SELECT entra_object_id, display_name
          FROM connector_ms365_directory.directory_users
          WHERE tenant_id = ${tenantId} AND entra_object_id = ANY(${userIds}::text[])
        `) as Array<{ entra_object_id: string; display_name: string }>

        const nameMap = new Map(dirRows.map((r) => [r.entra_object_id, r.display_name]))

        const rows = rawRows.map((r) => ({
          userId: r.user_id,
          displayName: nameMap.get(r.user_id) ?? r.user_id,
          openTasks: Number(r.open_tasks),
          overdueTasks: Number(r.overdue_tasks),
          dueThisWeek: Number(r.due_this_week),
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
