import type { Tool } from '@seta/agent-core'
import { tenantContext } from '@seta/tenant'
import PQueue from 'p-queue'
import { z } from 'zod'
import type { ReadToolDeps } from './list_my_tasks.js'

const Input = z.object({
  planId: z.string(),
  since: z.string().default('7 days ago'),
})

const Output = z.object({
  planName: z.string().nullable(),
  completed: z.array(z.unknown()),
  inProgress: z.array(z.unknown()),
  blocked: z.array(z.unknown()),
  upcoming: z.array(z.unknown()),
  unassigned: z.array(z.unknown()),
})

export function getProjectStatusTool(
  deps: ReadToolDeps,
): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'planner.get_project_status',
    description:
      'Get a project status overview: completed, in-progress, blocked, upcoming, and unassigned tasks.',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { readOnlyHint: true, idempotentHint: true },
    async execute(input, _ctx) {
      try {
        const tenantId = tenantContext.getTenantId()
        const sinceDate = new Date(
          input.since === '7 days ago' ? Date.now() - 7 * 86400_000 : input.since,
        )
        const blockedThreshold = new Date(Date.now() - 3 * 86400_000)
        const upcomingThreshold = new Date(Date.now() + 7 * 86400_000)

        const queue = new PQueue({ concurrency: 5 })
        const [planRows, completed, inProgress, blocked, upcoming, unassigned] = await Promise.all([
          queue.add(
            () => deps.sql`
            SELECT title FROM connector_ms365_planner.planner_plans_cache
            WHERE graph_plan_id = ${input.planId} AND tenant_id = ${tenantId} LIMIT 1
          `,
          ),
          queue.add(
            () => deps.sql`
            SELECT * FROM planner.v_visible_tasks
            WHERE plan_id = ${input.planId} AND percent_complete = 100
              AND last_modified_at_graph > ${sinceDate}
            LIMIT 20
          `,
          ),
          queue.add(
            () => deps.sql`
            SELECT * FROM planner.v_visible_tasks
            WHERE plan_id = ${input.planId} AND percent_complete BETWEEN 1 AND 99
            LIMIT 20
          `,
          ),
          queue.add(
            () => deps.sql`
            SELECT * FROM planner.v_visible_tasks
            WHERE plan_id = ${input.planId} AND percent_complete BETWEEN 1 AND 99
              AND last_modified_at_graph < ${blockedThreshold}
            LIMIT 20
          `,
          ),
          queue.add(
            () => deps.sql`
            SELECT * FROM planner.v_visible_tasks
            WHERE plan_id = ${input.planId} AND percent_complete = 0
              AND due_date <= ${upcomingThreshold}
            LIMIT 20
          `,
          ),
          queue.add(
            () => deps.sql`
            SELECT * FROM planner.v_visible_tasks
            WHERE plan_id = ${input.planId} AND percent_complete < 100
              AND (assignee_ids IS NULL OR array_length(assignee_ids, 1) IS NULL)
            LIMIT 20
          `,
          ),
        ])

        const planName = (planRows as Array<{ title: string }>)[0]?.title ?? null
        return {
          ok: true,
          value: {
            planName,
            completed: completed!,
            inProgress: inProgress!,
            blocked: blocked!,
            upcoming: upcoming!,
            unassigned: unassigned!,
          },
        }
      } catch (e) {
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}
