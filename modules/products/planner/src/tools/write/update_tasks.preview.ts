import type { Tool } from '@seta/agent-core'
import type { PlannerCache, PlannerClient } from '@seta/connector-ms365-planner'
import { Unauthorized } from '@seta/middleware'
import { logger } from '@seta/observability'
import { tenantContext } from '@seta/tenant'
import { z } from 'zod'
import { buildPreviewCard } from './_card'
import type { MintInput } from './_continuation'

const log = logger.child({ component: 'planner.update_tasks.preview' })

export interface PreviewDepsBase {
  registry: { requireConsent(tenantId: string, connectorId: string): Promise<void> }
  tokenForUser: (tenantId: string, userId: string) => Promise<{ accessToken: string }>
  buildClient: (token: string) => PlannerClient
  buildCache: (client: PlannerClient) => PlannerCache
  continuationStore: { mint(i: MintInput): Promise<{ token: string; expiresAt: Date }> }
  ttlMinutes: number
}

export interface PreviewDeps extends PreviewDepsBase {
  etagStore: { get(taskId: string): Promise<string | null> }
}

const UpdateOne = z.object({
  taskId: z.string().min(1),
  assignees: z.array(z.string()).optional(),
  dueDateTime: z.string().datetime().nullable().optional(),
  title: z.string().min(1).optional(),
  priority: z.number().int().min(0).max(10).optional(),
  percentComplete: z.number().int().min(0).max(100).optional(),
  bucketId: z.string().optional(),
  appliedCategories: z.record(z.string(), z.boolean()).optional(),
})

const Input = z.object({ updates: z.array(UpdateOne).min(1).max(100) })

const Output = z.object({
  card: z.record(z.string(), z.unknown()),
  token: z.string(),
  ttlMinutes: z.number().int().positive(),
})

export function updateTasksPreviewTool(
  deps: PreviewDeps,
): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'planner.update_tasks.preview',
    description:
      'Preview updates to one or more Planner tasks. Returns a confirmation card with a continuation token. Mutates nothing.',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { destructiveHint: false, requireApproval: true },
    async execute(input, _ctx) {
      try {
        log.debug(
          { tenantId: tenantContext.getTenantIdOrUndefined() },
          'planner.update_tasks.preview.start',
        )

        const tenantId = tenantContext.getTenantId()
        const userId = tenantContext.getUserId()
        if (!userId) throw new Unauthorized('no user context')

        await deps.registry.requireConsent(tenantId, 'ms365-planner')

        const { accessToken } = await deps.tokenForUser(tenantId, userId)
        const client = deps.buildClient(accessToken)
        const cache = deps.buildCache(client)

        const etagSnapshot: Record<string, string> = {}

        for (const update of input.updates) {
          const taskResult = await cache.task.one(update.taskId)
          if (taskResult === null) {
            return {
              ok: false,
              error: { name: 'NotFound', message: `Task ${update.taskId} not found` },
            }
          }

          const etag = await deps.etagStore.get(update.taskId)
          if (etag === null) {
            return {
              ok: false,
              error: { name: 'MissingEtag', message: `No ETag for task ${update.taskId}` },
            }
          }

          etagSnapshot[update.taskId] = etag
        }

        const { token } = await deps.continuationStore.mint({
          tenantId,
          userId,
          toolId: 'planner.update_tasks',
          payload: { updates: input.updates },
          etagSnapshot,
        })

        const n = input.updates.length
        const card = buildPreviewCard({
          title: 'Update Tasks',
          summary: `Update ${n} task(s)`,
          facts: input.updates.map((u) => ({ title: 'Task ID', value: u.taskId })),
          verb: 'planner.update_tasks.commit',
          token,
          ttlMinutes: deps.ttlMinutes,
        })

        return { ok: true, value: { card, token, ttlMinutes: deps.ttlMinutes } }
      } catch (e) {
        log.error({ err: e }, 'planner.update_tasks.preview.failed')
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}
