import type { Tool } from '@seta/agent-core'
import { z } from 'zod'
import type { ReadToolDeps } from './list_my_tasks.js'

const Input = z.object({
  planId: z.string(),
  bucketId: z.string().optional(),
  status: z.enum(['not_started', 'in_progress', 'completed']).optional(),
  assigneeId: z.string().optional(),
  limit: z.number().min(1).max(100).default(50),
})

const Output = z.object({ tasks: z.array(z.unknown()) })

export function listPlanTasksTool(
  deps: ReadToolDeps,
): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'planner.list_plan_tasks',
    description: 'List tasks in a specific Planner plan. Reads from local synced database.',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { readOnlyHint: true, idempotentHint: true },
    async execute(input, _ctx) {
      try {
        let rows = (await deps.sql`
          SELECT *
          FROM planner.v_visible_tasks
          WHERE plan_id = ${input.planId}
            AND (${input.bucketId ?? null}::text IS NULL OR bucket_id = ${input.bucketId ?? null})
            AND (${input.assigneeId ?? null}::text IS NULL OR ${input.assigneeId ?? null} = ANY(assignee_ids))
          ORDER BY due_date NULLS LAST, priority DESC NULLS LAST
          LIMIT ${input.limit}
        `) as Array<{ percent_complete: number }>

        if (input.status) {
          rows = rows.filter((r) => {
            if (input.status === 'not_started') return r.percent_complete === 0
            if (input.status === 'in_progress')
              return r.percent_complete > 0 && r.percent_complete < 100
            return r.percent_complete === 100
          })
        }

        return { ok: true, value: { tasks: rows } }
      } catch (e) {
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}
