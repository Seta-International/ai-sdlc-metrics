import type { Tool } from '@seta/agent-core'
import { logger } from '@seta/observability'
import { tenantContext } from '@seta/tenant'
import { z } from 'zod'
import type { ReadToolDeps } from './list_my_tasks'

const log = logger.child({ component: 'planner.get_task' })

const Input = z.object({ taskId: z.string() })
const Output = z.object({ task: z.unknown().nullable() })

export function getTaskTool(
  deps: ReadToolDeps,
): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'planner.get_task',
    description: 'Get details for a single Planner task including description and checklist.',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { readOnlyHint: true, idempotentHint: true },
    async execute(input, _ctx) {
      try {
        log.debug({ tenantId: tenantContext.getTenantIdOrUndefined() }, 'planner.get_task.start')

        const rows = await deps.sql`
          SELECT t.*, d.description, d.checklist
          FROM planner.v_visible_tasks t
          LEFT JOIN connector_ms365_planner.planner_task_details_cache d
            ON d.graph_task_id = t.graph_task_id AND d.tenant_id = t.tenant_id
          WHERE t.graph_task_id = ${input.taskId}
          LIMIT 1
        `
        return { ok: true, value: { task: rows[0] ?? null } }
      } catch (e) {
        log.error({ err: e }, 'planner.get_task.failed')
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}
