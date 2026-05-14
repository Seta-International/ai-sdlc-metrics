import type { Tool } from '@seta/agent-core'
import { Unauthorized } from '@seta/middleware'
import { logger } from '@seta/observability'
import { tenantContext } from '@seta/tenant'
import { z } from 'zod'
import { buildPreviewCard } from './_card'
import type { MintInput } from './_continuation'

const log = logger.child({ component: 'planner.create_plan.preview' })

interface CreatePlanPreviewDeps {
  registry: { requireConsent(tenantId: string, connectorId: string): Promise<void> }
  continuationStore: { mint(i: MintInput): Promise<{ token: string; expiresAt: Date }> }
  ttlMinutes: number
}

const Input = z.object({
  ownerGroupId: z.string().min(1),
  title: z.string().min(1).max(255),
})

const Output = z.object({
  card: z.record(z.string(), z.unknown()),
  token: z.string(),
  ttlMinutes: z.number().int().positive(),
})

export function createPlanPreviewTool(
  deps: CreatePlanPreviewDeps,
): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'planner.create_plan.preview',
    description:
      'Preview creation of a new Planner plan. Returns a confirmation card with a continuation token. Mutates nothing.',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { destructiveHint: true, requireApproval: true },
    async execute(input, _ctx) {
      try {
        log.debug(
          { tenantId: tenantContext.getTenantIdOrUndefined() },
          'planner.create_plan.preview.start',
        )

        const tenantId = tenantContext.getTenantId()
        const userId = tenantContext.getUserId()
        if (!userId) throw new Unauthorized('no user context')

        await deps.registry.requireConsent(tenantId, 'ms365-planner')

        const { token } = await deps.continuationStore.mint({
          tenantId,
          userId,
          toolId: 'planner.create_plan',
          payload: { ownerGroupId: input.ownerGroupId, title: input.title },
          etagSnapshot: {},
        })

        const card = buildPreviewCard({
          title: 'Create Plan',
          summary: `Create plan "${input.title}" in group ${input.ownerGroupId}`,
          facts: [
            { title: 'Title', value: input.title },
            { title: 'Owner Group', value: input.ownerGroupId },
          ],
          verb: 'planner.create_plan.commit',
          token,
          ttlMinutes: deps.ttlMinutes,
        })

        return { ok: true, value: { card, token, ttlMinutes: deps.ttlMinutes } }
      } catch (e) {
        log.error({ err: e }, 'planner.create_plan.preview.failed')
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}
