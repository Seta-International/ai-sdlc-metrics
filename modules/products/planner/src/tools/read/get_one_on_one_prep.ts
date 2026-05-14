import type { Tool } from '@seta/agent-core'
import { tenantContext } from '@seta/tenant'
import { z } from 'zod'
import type { ReadToolDeps } from './list_my_tasks.js'

const Input = z.object({
  targetUserId: z.string(),
  lookbackDays: z.number().int().min(1).max(30).default(14),
})

const Output = z.object({
  targetName: z.string().nullable(),
  completed: z.array(z.unknown()),
  inProgress: z.array(z.unknown()),
  blocked: z.array(z.unknown()),
  workloadPercent: z.number(),
  talkingPoints: z.array(z.string()),
})

export function getOneOnOnePrepTool(
  deps: ReadToolDeps,
): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'planner.get_one_on_one_prep',
    description: '1:1 prep: completed/in-progress/blocked tasks + workload % for a direct report.',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { readOnlyHint: true, idempotentHint: true },
    async execute(input, _ctx) {
      try {
        const tenantId = tenantContext.getTenantId()
        const userId = tenantContext.getUserId()

        const managerCheck = await deps.sql`
          SELECT manager_id FROM connector_ms365_directory.directory_users
          WHERE entra_object_id = ${input.targetUserId} AND tenant_id = ${tenantId}
          LIMIT 1
        `
        const managerId = (managerCheck[0] as { manager_id: string | null } | undefined)?.manager_id
        if (managerId !== userId) {
          return {
            ok: false,
            error: { name: 'Forbidden', message: 'Target user is not your direct report' },
          }
        }

        const nameRow = (await deps.sql`
          SELECT display_name FROM connector_ms365_directory.directory_users
          WHERE entra_object_id = ${input.targetUserId} AND tenant_id = ${tenantId} LIMIT 1
        `) as Array<{ display_name: string }>
        const targetName = nameRow[0]?.display_name ?? null

        const sinceDate = new Date(Date.now() - input.lookbackDays * 86400_000)
        const blockedThreshold = new Date(Date.now() - 3 * 86400_000)

        const [completed, inProgress, allOpen] = await Promise.all([
          deps.sql`
            SELECT * FROM planner.v_visible_tasks
            WHERE ${input.targetUserId} = ANY(assignee_ids)
              AND percent_complete = 100 AND last_modified_at_graph > ${sinceDate}
            LIMIT 20
          `,
          deps.sql`
            SELECT * FROM planner.v_visible_tasks
            WHERE ${input.targetUserId} = ANY(assignee_ids)
              AND percent_complete BETWEEN 1 AND 99
            LIMIT 20
          `,
          deps.sql`
            SELECT * FROM planner.v_visible_tasks
            WHERE ${input.targetUserId} = ANY(assignee_ids) AND percent_complete < 100
          `,
        ])

        const blocked = (inProgress as Array<{ last_modified_at_graph: Date | null }>).filter(
          (t) => !t.last_modified_at_graph || t.last_modified_at_graph < blockedThreshold,
        )

        const open = allOpen.length
        const done = (completed as unknown[]).length
        const workloadPercent = open + done > 0 ? Math.round((open / (open + done)) * 100) : 0

        const talkingPoints: string[] = []
        if (blocked.length > 0)
          talkingPoints.push(`${blocked.length} task(s) appear stuck (no update in 3+ days)`)
        if (workloadPercent > 80)
          talkingPoints.push('High open-task load — check if anything can be deprioritised')

        return {
          ok: true,
          value: { targetName, completed, inProgress, blocked, workloadPercent, talkingPoints },
        }
      } catch (e) {
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}
