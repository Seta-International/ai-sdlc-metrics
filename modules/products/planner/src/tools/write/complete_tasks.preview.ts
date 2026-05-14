import type { Tool } from '@seta/agent-core'
import { Unauthorized } from '@seta/middleware'
import { tenantContext } from '@seta/tenant'
import { z } from 'zod'
import { buildPreviewCard } from './_card.js'
import type { PreviewDeps } from './update_tasks.preview.js'

const Input = z.object({ taskIds: z.array(z.string().min(1)).min(1).max(100) })

const Output = z.object({
  card: z.record(z.string(), z.unknown()),
  token: z.string(),
  ttlMinutes: z.number().int().positive(),
})

export function completeTasksPreviewTool(
  deps: PreviewDeps,
): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'planner.complete_tasks.preview',
    description:
      'Preview marking one or more Planner tasks as complete. Returns a confirmation card with a continuation token. Mutates nothing.',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { destructiveHint: false, requireApproval: true },
    async execute(input, _ctx) {
      try {
        const tenantId = tenantContext.getTenantId()
        const userId = tenantContext.getUserId()
        if (!userId) throw new Unauthorized('no user context')

        await deps.registry.requireConsent(tenantId, 'ms365-planner')

        const { accessToken } = await deps.tokenForUser(tenantId, userId)
        const client = deps.buildClient(accessToken)
        const cache = deps.buildCache(client)

        const etagSnapshot: Record<string, string> = {}

        for (const taskId of input.taskIds) {
          const taskResult = await cache.task.one(taskId)
          if (taskResult === null) {
            return {
              ok: false,
              error: { name: 'NotFound', message: `Task ${taskId} not found` },
            }
          }

          const etag = await deps.etagStore.get(taskId)
          if (etag === null) {
            return {
              ok: false,
              error: { name: 'MissingEtag', message: `No ETag for task ${taskId}` },
            }
          }

          etagSnapshot[taskId] = etag
        }

        const { token } = await deps.continuationStore.mint({
          tenantId,
          userId,
          toolId: 'planner.complete_tasks',
          payload: { taskIds: input.taskIds },
          etagSnapshot,
        })

        const n = input.taskIds.length
        const card = buildPreviewCard({
          title: 'Complete Tasks',
          summary: `Mark ${n} task(s) as complete`,
          facts: input.taskIds.map((id) => ({ title: 'Task', value: id })),
          verb: 'planner.complete_tasks.commit',
          token,
          ttlMinutes: deps.ttlMinutes,
        })

        return { ok: true, value: { card, token, ttlMinutes: deps.ttlMinutes } }
      } catch (e) {
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}
