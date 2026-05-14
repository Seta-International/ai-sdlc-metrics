import type { Tool } from '@seta/agent-core'
import type { GraphFetch } from '@seta/connector-ms365-planner'
import { Unauthorized } from '@seta/middleware'
import { logger } from '@seta/observability'
import { tenantContext } from '@seta/tenant'
import { z } from 'zod'
import { ContinuationConsumed } from './_errors'

const log = logger.child({ component: 'planner.create_plan.commit' })

export interface CreatePlanCommitDeps {
  registry: { requireConsent(tenantId: string, connectorId: string): Promise<void> }
  tokenForUser: (tenantId: string, userId: string) => Promise<{ accessToken: string }>
  buildGraph: () => GraphFetch
  buildCache: () => {
    plan: {
      upsert(planId: string, etag: string, raw: unknown): Promise<void>
    }
  }
  continuationStore: {
    verify(v: {
      token: string
      userId: string
      tenantId: string
      toolId: string
    }): Promise<{ payload: Record<string, unknown>; etagSnapshot: Record<string, string> }>
    markConsumed(token: string, card: Record<string, unknown>): Promise<void>
  }
}

const Input = z.object({ token: z.string().min(1) })

const Output = z.object({
  card: z.record(z.string(), z.unknown()),
  results: z.array(
    z.object({
      taskId: z.string(),
      status: z.enum(['ok', 'conflict', 'forbidden', 'missing', 'rate_limited', 'failed']),
      reason: z.string().optional(),
    }),
  ),
  summary: z.object({ succeeded: z.number().int(), failed: z.number().int() }),
})

export function createPlanCommitTool(
  deps: CreatePlanCommitDeps,
): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'planner.create_plan.commit',
    description:
      'Commit a previously previewed planner.create_plan request. Idempotent — re-submitting a consumed token replays the cached result.',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { destructiveHint: true, idempotentHint: true },
    async execute(input, _ctx) {
      try {
        log.debug(
          { tenantId: tenantContext.getTenantIdOrUndefined() },
          'planner.create_plan.commit.start',
        )

        const tenantId = tenantContext.getTenantId()
        const userId = tenantContext.getUserId()
        if (!userId) throw new Unauthorized('no user context')

        await deps.registry.requireConsent(tenantId, 'ms365-planner')

        let verified: { payload: Record<string, unknown>; etagSnapshot: Record<string, string> }
        try {
          verified = await deps.continuationStore.verify({
            token: input.token,
            userId,
            tenantId,
            toolId: 'planner.create_plan',
          })
        } catch (e) {
          if (e instanceof ContinuationConsumed && e.cachedResultCard) {
            return {
              ok: true,
              value: {
                card: e.cachedResultCard,
                results: [],
                summary: { succeeded: 0, failed: 0 },
              },
            }
          }
          throw e
        }

        const payload = verified.payload as { ownerGroupId: string; title: string }
        const { accessToken } = await deps.tokenForUser(tenantId, userId)
        const graph = deps.buildGraph()
        const cache = deps.buildCache()

        const result = await graph.call<{ id: string; '@odata.etag'?: string }>({
          token: accessToken,
          method: 'POST',
          path: '/planner/plans',
          body: {
            container: { url: `https://graph.microsoft.com/v1.0/groups/${payload.ownerGroupId}` },
            title: payload.title,
          },
          actor: { type: 'user', userId },
          connectorId: 'ms365-planner',
        })

        if (result.etag != null) {
          await cache.plan.upsert(result.data.id, result.etag, result.data)
        }

        const card: Record<string, unknown> = {
          type: 'AdaptiveCard',
          version: '1.5',
          body: [
            {
              type: 'TextBlock',
              text: 'Plan created',
              size: 'Medium',
              weight: 'Bolder',
            },
            {
              type: 'FactSet',
              facts: [
                { title: 'Plan ID', value: result.data.id },
                { title: 'Title', value: payload.title },
              ],
            },
          ],
          actions: [],
        }

        await deps.continuationStore.markConsumed(input.token, card)

        return {
          ok: true,
          value: {
            card,
            results: [{ taskId: result.data.id, status: 'ok' }],
            summary: { succeeded: 1, failed: 0 },
          },
        }
      } catch (e) {
        log.error({ err: e }, 'planner.create_plan.commit.failed')
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}
