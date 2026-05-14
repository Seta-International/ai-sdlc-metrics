import type { Tool } from '@seta/agent-core'
import { Unauthorized } from '@seta/middleware'
import { logger } from '@seta/observability'
import { tenantContext } from '@seta/tenant'
import { z } from 'zod'
import { buildPreviewCard } from './_card'
import type { PreviewDepsBase } from './update_tasks.preview'

const log = logger.child({ component: 'planner.add_comments.preview' })

const CommentItem = z.object({
  taskId: z.string().min(1),
  body: z.string().min(1).max(4000),
})

const Input = z.object({ comments: z.array(CommentItem).min(1).max(100) })

const Output = z.object({
  card: z.record(z.string(), z.unknown()),
  token: z.string(),
  ttlMinutes: z.number().int().positive(),
})

export function addCommentsPreviewTool(
  deps: PreviewDepsBase,
): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'planner.add_comments.preview',
    description:
      'Preview adding comments to one or more Planner tasks. Returns a confirmation card with a continuation token. Mutates nothing.',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { destructiveHint: false, requireApproval: true },
    async execute(input, _ctx) {
      try {
        log.debug(
          { tenantId: tenantContext.getTenantIdOrUndefined() },
          'planner.add_comments.preview.start',
        )

        const tenantId = tenantContext.getTenantId()
        const userId = tenantContext.getUserId()
        if (!userId) throw new Unauthorized('no user context')

        await deps.registry.requireConsent('ms365-planner')

        const { accessToken } = await deps.tokenForUser(tenantId, userId)
        const client = deps.buildClient(accessToken)
        const cache = deps.buildCache(client)

        const uniqueTaskIds = [...new Set(input.comments.map((c) => c.taskId))]
        for (const taskId of uniqueTaskIds) {
          const taskResult = await cache.task.one(taskId)
          if (taskResult === null) {
            return {
              ok: false,
              error: { name: 'NotFound', message: `Task ${taskId} not found` },
            }
          }
        }

        const { token } = await deps.continuationStore.mint({
          tenantId,
          userId,
          toolId: 'planner.add_comments',
          payload: { comments: input.comments },
          etagSnapshot: {},
        })

        const n = input.comments.length
        const card = buildPreviewCard({
          title: 'Add Comments',
          summary: `Add ${n} comment(s) to Planner task(s)`,
          facts: input.comments.map((c) => ({ title: 'Task', value: c.taskId })),
          verb: 'planner.add_comments.commit',
          token,
          ttlMinutes: deps.ttlMinutes,
        })

        return { ok: true, value: { card, token, ttlMinutes: deps.ttlMinutes } }
      } catch (e) {
        log.error({ err: e }, 'planner.add_comments.preview.failed')
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}
