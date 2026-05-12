import type { Tool } from '@seta/agent-core'
import type { PlannerCache, PlannerClient } from '@seta/connector-ms365-planner'
import { Unauthorized } from '@seta/middleware'
import { tenantContext } from '@seta/tenant'
import { z } from 'zod'

export interface ReadToolDeps {
  registry: { requireConsent(tenantId: string, connectorId: string): Promise<void> }
  tokenForUser: (tenantId: string, userId: string) => Promise<{ accessToken: string }>
  buildClient: (token: string) => PlannerClient
  buildCache: (client: PlannerClient) => PlannerCache
}

const Input = z.object({}).strict()
const Output = z.object({
  items: z.array(z.unknown()),
  source: z.enum(['cache:fresh', 'cache:stale-fallback', 'live']),
  ageSeconds: z.number().int().nonnegative().optional(),
})

export function listMyTasksTool(
  deps: ReadToolDeps,
): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'planner.list_my_tasks',
    description: 'List Planner tasks assigned to the caller. Always fetches live from Graph.',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { readOnlyHint: true, idempotentHint: true },
    async execute(_input, _ctx) {
      try {
        const tenantId = tenantContext.getTenantId()
        const userId = tenantContext.getUserId()
        if (!userId) throw new Unauthorized('no user context')
        await deps.registry.requireConsent(tenantId, 'ms365-planner')
        const { accessToken } = await deps.tokenForUser(tenantId, userId)
        const client = deps.buildClient(accessToken)
        const items: unknown[] = []
        for await (const t of client.listMyTasks()) items.push(t)
        return { ok: true, value: { items, source: 'live' as const } }
      } catch (e) {
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}
