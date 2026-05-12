import type { Tool } from '@seta/agent-core'
import { Unauthorized } from '@seta/middleware'
import { tenantContext } from '@seta/tenant'
import { z } from 'zod'
import { ContinuationConsumed } from '../_errors'

export interface AddCommentsCommitDeps {
  registry: { requireConsent(tenantId: string, connectorId: string): Promise<void> }
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

export function addCommentsCommitTool(
  deps: AddCommentsCommitDeps,
): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'planner.add_comments.commit',
    description:
      'Commit a previously previewed planner.add_comments request. Currently stubbed — comment posting via Graph conversation threads is pending pattern verification.',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { destructiveHint: true, idempotentHint: true },
    async execute(input, _ctx) {
      try {
        const tenantId = tenantContext.getTenantId()
        const userId = tenantContext.getUserId()
        if (!userId) throw new Unauthorized('no user context')

        await deps.registry.requireConsent(tenantId, 'ms365-planner')

        try {
          await deps.continuationStore.verify({
            token: input.token,
            userId,
            tenantId,
            toolId: 'planner.add_comments',
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

        const card: Record<string, unknown> = {
          type: 'AdaptiveCard',
          version: '1.5',
          body: [
            {
              type: 'TextBlock',
              text: 'Comment posting not yet implemented',
              size: 'Medium',
            },
          ],
          actions: [],
        }

        await deps.continuationStore.markConsumed(input.token, card)

        return {
          ok: true,
          value: {
            card,
            results: [],
            summary: { succeeded: 0, failed: 0 },
          },
        }
      } catch (e) {
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}
