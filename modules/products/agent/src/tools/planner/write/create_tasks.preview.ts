import type { Tool } from '@seta/agent-core'
import type { PlannerCache, PlannerClient } from '@seta/connector-ms365-planner'
import { Unauthorized } from '@seta/middleware'
import { tenantContext } from '@seta/tenant'
import { z } from 'zod'
import type { MintInput } from '../_continuation'
import { buildPreviewCard } from './_card'

interface CreateTasksPreviewDeps {
  registry: { requireConsent(tenantId: string, connectorId: string): Promise<void> }
  tokenForUser: (tenantId: string, userId: string) => Promise<{ accessToken: string }>
  buildClient: (token: string) => PlannerClient
  buildCache: (client: PlannerClient) => PlannerCache
  continuationStore: { mint(i: MintInput): Promise<{ token: string; expiresAt: Date }> }
  ttlMinutes: number
}

const TaskToCreate = z.object({
  planId: z.string().min(1),
  bucketId: z.string().optional(),
  title: z.string().min(1),
  assignees: z.array(z.string()).optional(),
  dueDateTime: z.string().datetime().nullable().optional(),
  priority: z.number().int().min(0).max(10).optional(),
})

const Input = z.object({ tasks: z.array(TaskToCreate).min(1).max(100) })

const Output = z.object({
  card: z.record(z.string(), z.unknown()),
  token: z.string(),
  ttlMinutes: z.number().int().positive(),
})

export function createTasksPreviewTool(
  deps: CreateTasksPreviewDeps,
): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'planner.create_tasks.preview',
    description:
      'Preview creation of one or more Planner tasks. Returns a confirmation card with a continuation token. Mutates nothing.',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { destructiveHint: true, requireApproval: true },
    async execute(input, _ctx) {
      try {
        const tenantId = tenantContext.getTenantId()
        const userId = tenantContext.getUserId()
        if (!userId) throw new Unauthorized('no user context')

        await deps.registry.requireConsent(tenantId, 'ms365-planner')

        const { accessToken } = await deps.tokenForUser(tenantId, userId)
        const client = deps.buildClient(accessToken)
        const cache = deps.buildCache(client)

        const uniquePlanIds = [...new Set(input.tasks.map((t) => t.planId))]

        for (const planId of uniquePlanIds) {
          const planResult = await cache.plan.one(planId)
          if (planResult === null) {
            return {
              ok: false,
              error: { name: 'NotFound', message: `Plan ${planId} not found` },
            }
          }
        }

        const { token } = await deps.continuationStore.mint({
          tenantId,
          userId,
          toolId: 'planner.create_tasks',
          payload: { tasks: input.tasks },
          etagSnapshot: {},
        })

        const n = input.tasks.length
        const planIdsSummary = uniquePlanIds.join(', ')
        const card = buildPreviewCard({
          title: 'Create Tasks',
          summary: `Create ${n} task(s) in plan(s) ${planIdsSummary}`,
          facts: input.tasks.map((t, i) => ({ title: `#${i + 1}`, value: t.title })),
          verb: 'planner.create_tasks.commit',
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
