import type { Tool } from '@seta/agent-core'
import { Unauthorized } from '@seta/middleware'
import { tenantContext } from '@seta/tenant'
import { z } from 'zod'
import type { ReadToolDeps } from './list_my_tasks'

const Input = z.object({ planId: z.string().min(1) })
const Output = z.object({
  items: z.array(z.unknown()),
  source: z.enum(['cache:fresh', 'cache:stale-fallback', 'live']),
  ageSeconds: z.number().int().nonnegative().optional(),
})

export function listPlanTasksTool(
  deps: ReadToolDeps,
): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'planner.list_plan_tasks',
    description: 'List all tasks in a Planner plan. Always fetches live from Graph.',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { readOnlyHint: true, idempotentHint: true },
    async execute(input, _ctx) {
      try {
        const tenantId = tenantContext.getTenantId()
        const userId = tenantContext.getUserId()
        if (!userId) throw new Unauthorized('no user context')
        await deps.registry.requireConsent(tenantId, 'ms365-planner')
        const { accessToken } = await deps.tokenForUser(tenantId, userId)
        const client = deps.buildClient(accessToken)
        const items: unknown[] = []
        for await (const t of client.listPlanTasks(input.planId)) items.push(t)
        return { ok: true, value: { items, source: 'live' as const } }
      } catch (e) {
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}
