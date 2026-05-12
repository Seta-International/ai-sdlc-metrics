import type { Tool } from '@seta/agent-core'
import { tenantContext } from '@seta/tenant'
import { z } from 'zod'
import type { ReadToolDeps } from './list_my_tasks'

const Input = z.object({ taskId: z.string().min(1) })
const Output = z.object({
  task: z.unknown(),
  details: z.unknown().optional(),
  source: z.enum(['cache:fresh', 'cache:stale-fallback', 'live']),
  ageSeconds: z.number().int().nonnegative().optional(),
})

export function getTaskTool(
  deps: ReadToolDeps,
): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'planner.get_task',
    description: 'Get a single Planner task with its details. Uses cache when fresh.',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { readOnlyHint: true, idempotentHint: true },
    async execute(input, _ctx) {
      try {
        const tenantId = tenantContext.getTenantId()
        const userId = tenantContext.getUserId() ?? ''
        await deps.registry.requireConsent(tenantId, 'ms365-planner')
        const { accessToken } = await deps.tokenForUser(tenantId, userId)
        const client = deps.buildClient(accessToken)
        const cache = deps.buildCache(client)
        const [taskResult, detailsResult] = await Promise.all([
          cache.task.one(input.taskId),
          cache.taskDetails.one(input.taskId),
        ])
        if (taskResult === null) {
          return { ok: false, error: { name: 'NotFound', message: 'task not found' } }
        }
        return {
          ok: true,
          value: {
            task: taskResult.data,
            details: detailsResult?.data,
            source: taskResult.source,
            ageSeconds: taskResult.ageSeconds,
          },
        }
      } catch (e) {
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}
