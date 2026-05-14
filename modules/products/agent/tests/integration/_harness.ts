import type { ToolExecutionContext } from '@seta/agent-core'
import type { createPool } from '@seta/db'
import type { createGraphFetch } from '@seta/ms-graph'
import { tenantContext } from '@seta/tenant'
import { createPlannerTools } from '../../src/index'

export const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'
export const TEST_TENANT_ID = '99999999-0000-0000-0000-000000000001'
export const TEST_USER_ID = '99999999-0000-0000-0000-000000000002'
export const TEST_GROUP_ID = '99999999-0000-0000-0000-000000000003'

export type Sql = ReturnType<typeof createPool>

export async function truncatePlannerData(sql: Sql): Promise<void> {
  await sql`DELETE FROM connector_ms365_planner.planner_tasks_cache        WHERE tenant_id = ${TEST_TENANT_ID}`
  await sql`DELETE FROM connector_ms365_planner.planner_task_details_cache WHERE tenant_id = ${TEST_TENANT_ID}`
  await sql`DELETE FROM connector_ms365_planner.planner_plans_cache        WHERE tenant_id = ${TEST_TENANT_ID}`
  await sql`DELETE FROM connector_ms365_planner.planner_buckets_cache      WHERE tenant_id = ${TEST_TENANT_ID}`
  await sql`DELETE FROM agent.write_continuations                          WHERE tenant_id = ${TEST_TENANT_ID}`
  await sql`DELETE FROM audit.audit_log                                    WHERE tenant_id = ${TEST_TENANT_ID}`
}

export function createDispatch(graph: ReturnType<typeof createGraphFetch>, sql: Sql) {
  const tools = createPlannerTools({
    registry: {
      register: () => {},
      get: () => {
        throw new Error('unused')
      },
      list: () => [],
      listByProvider: () => [],
      scopeUnion: () => ({ delegated: [], application: [] }),
      requireConsent: async () => {},
    } as never,
    vault: {
      get: async () => ({
        accessToken: 'test-graph-token',
        refreshToken: null,
        scopes: [],
        expiresAt: new Date(Date.now() + 3_600_000),
        meta: {},
      }),
      put: async () => {},
      delete: async () => {},
    },
    graph,
    sql: sql as never,
    hmacKey: 'a'.repeat(64),
    ttls: { tasks: 60, plans: 600, buckets: 300, staleFallbackMax: 3600 },
    continuationTtlMin: 15,
    batchConcurrency: 3,
  })

  return async function dispatch(toolId: string, input: Record<string, unknown>): Promise<unknown> {
    const tool = tools.find((t) => t.id === toolId)
    if (!tool) throw new Error(`Unknown tool: ${toolId}`)
    const ctx: ToolExecutionContext = {
      surface: 'direct',
      abortSignal: new AbortController().signal,
      runId: 'integration-test',
      requestContext: {} as never,
    }
    const execute = tool.execute as (input: never, ctx: ToolExecutionContext) => Promise<unknown>
    return tenantContext.run({ tenantId: TEST_TENANT_ID, userId: TEST_USER_ID }, () =>
      execute(input as never, ctx),
    )
  }
}
