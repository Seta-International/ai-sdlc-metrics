import type { Tool } from '@seta/agent-core'
import { tenantContext } from '@seta/tenant'
import { z } from 'zod'
import type { ReadToolDeps } from './list_my_tasks'

const Input = z.object({}).strict()
const Output = z.object({
  items: z.array(z.unknown()),
  source: z.enum(['cache:fresh', 'cache:stale-fallback', 'live']),
  ageSeconds: z.number().int().nonnegative().optional(),
})

export function listPlansTool(
  deps: ReadToolDeps,
): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'planner.list_plans',
    description: 'List Planner plans the caller is a member of. Always fetches live from Graph.',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { readOnlyHint: true, idempotentHint: true },
    async execute(_input, _ctx) {
      try {
        const tenantId = tenantContext.getTenantId()
        const userId = tenantContext.getUserId() ?? ''
        await deps.registry.requireConsent(tenantId, 'ms365-planner')
        const { accessToken } = await deps.tokenForUser(tenantId, userId)
        const client = deps.buildClient(accessToken)
        const items: unknown[] = []
        for await (const p of client.listMyPlans()) items.push(p)
        return { ok: true, value: { items, source: 'live' as const } }
      } catch (e) {
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}
