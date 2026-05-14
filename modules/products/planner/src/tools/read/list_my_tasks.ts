import type { Tool } from '@seta/agent-core'
import { tenantContext } from '@seta/tenant'
import { z } from 'zod'

export type DbSql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>

export interface ReadToolDeps {
  sql: DbSql
}

const Input = z.object({
  timeRange: z.enum(['today', 'this_week', 'overdue', 'all']).default('today'),
  planId: z.string().optional(),
  status: z.enum(['not_started', 'in_progress', 'completed']).optional(),
  limit: z.number().min(1).max(50).default(20),
})

const TaskRow = z.object({
  graph_task_id: z.string(),
  title: z.string(),
  percent_complete: z.number(),
  due_date: z.coerce.date().nullable(),
  assignee_ids: z.array(z.string()),
  plan_id: z.string().optional(),
  priority: z.number().optional(),
})

const Output = z.object({
  tasks: z.array(TaskRow),
  summary: z.object({ total: z.number(), overdue: z.number(), dueToday: z.number() }),
})

export function listMyTasksTool(
  deps: ReadToolDeps,
): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'planner.list_my_tasks',
    description: 'List Planner tasks assigned to the caller from the synced local database.',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { readOnlyHint: true, idempotentHint: true },
    async execute(input, _ctx) {
      try {
        const userId = tenantContext.getUserId()
        const now = new Date()
        const todayEnd = new Date(now)
        todayEnd.setHours(23, 59, 59, 999)
        const weekEnd = new Date(now.getTime() + 7 * 86400_000)

        let rows: z.infer<typeof TaskRow>[]

        if (input.timeRange === 'today') {
          rows = (await deps.sql`
            SELECT graph_task_id, title, percent_complete, due_date, assignee_ids, plan_id, priority
            FROM planner.v_visible_tasks
            WHERE ${userId} = ANY(assignee_ids)
              AND (
                (due_date <= ${todayEnd} AND percent_complete < 100)
                OR (percent_complete BETWEEN 1 AND 99 AND due_date IS NULL)
              )
              ${input.planId ? deps.sql`AND plan_id = ${input.planId}` : deps.sql``}
            ORDER BY due_date NULLS LAST, priority DESC NULLS LAST
            LIMIT ${input.limit}
          `) as z.infer<typeof TaskRow>[]
        } else if (input.timeRange === 'overdue') {
          rows = (await deps.sql`
            SELECT graph_task_id, title, percent_complete, due_date, assignee_ids, plan_id, priority
            FROM planner.v_visible_tasks
            WHERE ${userId} = ANY(assignee_ids)
              AND due_date < ${now} AND percent_complete < 100
              ${input.planId ? deps.sql`AND plan_id = ${input.planId}` : deps.sql``}
            ORDER BY due_date NULLS LAST, priority DESC NULLS LAST
            LIMIT ${input.limit}
          `) as z.infer<typeof TaskRow>[]
        } else if (input.timeRange === 'this_week') {
          rows = (await deps.sql`
            SELECT graph_task_id, title, percent_complete, due_date, assignee_ids, plan_id, priority
            FROM planner.v_visible_tasks
            WHERE ${userId} = ANY(assignee_ids)
              AND due_date <= ${weekEnd} AND percent_complete < 100
              ${input.planId ? deps.sql`AND plan_id = ${input.planId}` : deps.sql``}
            ORDER BY due_date NULLS LAST, priority DESC NULLS LAST
            LIMIT ${input.limit}
          `) as z.infer<typeof TaskRow>[]
        } else {
          rows = (await deps.sql`
            SELECT graph_task_id, title, percent_complete, due_date, assignee_ids, plan_id, priority
            FROM planner.v_visible_tasks
            WHERE ${userId} = ANY(assignee_ids)
              ${input.planId ? deps.sql`AND plan_id = ${input.planId}` : deps.sql``}
            ORDER BY due_date NULLS LAST, priority DESC NULLS LAST
            LIMIT ${input.limit}
          `) as z.infer<typeof TaskRow>[]
        }

        if (input.status) {
          rows = rows.filter((t) => {
            if (input.status === 'not_started') return t.percent_complete === 0
            if (input.status === 'in_progress')
              return t.percent_complete > 0 && t.percent_complete < 100
            return t.percent_complete === 100
          })
        }

        const overdue = rows.filter(
          (t) => t.due_date && t.due_date < now && t.percent_complete < 100,
        ).length
        const dueToday = rows.filter(
          (t) => t.due_date && t.due_date <= todayEnd && t.percent_complete < 100,
        ).length
        return {
          ok: true,
          value: { tasks: rows, summary: { total: rows.length, overdue, dueToday } },
        }
      } catch (e) {
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}
