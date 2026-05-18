import type { Tool } from '@seta/agent-core'
import { logger } from '@seta/observability'
import { tenantContext } from '@seta/tenancy'
import { z } from 'zod'
import type { ReadToolDeps } from './list_my_tasks'

const log = logger.child({ component: 'planner.list_buckets' })

const Input = z.object({ planId: z.string() })
const Output = z.object({ buckets: z.array(z.unknown()) })

export function listBucketsTool(
  deps: ReadToolDeps,
): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'planner.list_buckets',
    description: 'List Planner buckets in a plan.',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { readOnlyHint: true, idempotentHint: true },
    async execute(input, _ctx) {
      try {
        log.debug(
          { tenantId: tenantContext.getTenantIdOrUndefined() },
          'planner.list_buckets.start',
        )

        // RLS + withTenant SET LOCAL already scopes by tenant_id
        const buckets = await deps.sql`
          SELECT * FROM connector_ms365_planner.planner_buckets_cache
          WHERE plan_id = ${input.planId}
            AND soft_deleted_at IS NULL
          ORDER BY order_hint
        `
        return { ok: true, value: { buckets } }
      } catch (e) {
        log.error({ err: e }, 'planner.list_buckets.failed')
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}
