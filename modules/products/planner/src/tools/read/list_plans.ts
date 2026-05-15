import type { Tool } from '@seta/agent-core'
import { logger } from '@seta/observability'
import { tenantContext } from '@seta/tenancy'
import { z } from 'zod'
import type { ReadToolDeps } from './list_my_tasks'

const log = logger.child({ component: 'planner.list_plans' })

const Input = z.object({ limit: z.number().min(1).max(50).default(20) })
const Output = z.object({ plans: z.array(z.unknown()) })

export function listPlansTool(
  deps: ReadToolDeps,
): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'planner.list_plans',
    description: 'List Planner plans the caller is a member of, from local synced database.',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { readOnlyHint: true, idempotentHint: true },
    async execute(input, _ctx) {
      try {
        log.debug({ tenantId: tenantContext.getTenantIdOrUndefined() }, 'planner.list_plans.start')

        const plans = await deps.sql`
          SELECT * FROM planner.v_visible_plans ORDER BY title LIMIT ${input.limit}
        `
        return { ok: true, value: { plans } }
      } catch (e) {
        log.error({ err: e }, 'planner.list_plans.failed')
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}
