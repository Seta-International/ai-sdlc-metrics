import { serve } from '@hono/node-server'
import { createPlannerTools, createThreadRoutes, PLANNER_AGENT_CONFIG } from '@seta/agent'
import { run as runKernel, streamKernelSSE } from '@seta/agent-core'
import type { RunInput, Tool, ToolExecutionContext } from '@seta/agent-core'
import { createAuditWriter } from '@seta/audit'
import { directoryConnector } from '@seta/connector-ms365-directory'
import { plannerConnector } from '@seta/connector-ms365-planner'
import { createConnectorRegistry } from '@seta/connector-registry'
import { onError } from '@seta/middleware'
import { createGraphFetch } from '@seta/ms-graph'
import {
  createKmsClient,
  createOAuthRoutes,
  createStateStore,
  createTokenVault,
  EntraProvider,
} from '@seta/oauth'
import { logger } from '@seta/observability'
import { tenantContext } from '@seta/tenant'
import { Hono, type Context } from 'hono'
import { agentMemory, agentRegistry } from './agent'
import { sql } from './db'
import { env } from './env'

const kms = createKmsClient({
  KMS_PROVIDER: env.KMS_PROVIDER,
  ...(env.AWS_REGION !== undefined && { AWS_REGION: env.AWS_REGION }),
  ...(env.KMS_KEY_ARN !== undefined && { KMS_KEY_ARN: env.KMS_KEY_ARN }),
  ...(env.DEV_DEK_BASE64 !== undefined && { DEV_DEK_BASE64: env.DEV_DEK_BASE64 }),
})
const vault = createTokenVault({ sql, kms })
const stateStore = createStateStore(sql)
const audit = createAuditWriter(sql)

const registry = createConnectorRegistry(async (tenantId, connectorId) => {
  const rows = await sql<Array<{ ok: number }>>`
    SELECT 1 AS ok FROM tenant.tenant_connectors
     WHERE tenant_id = ${tenantId}
       AND connector_id = ${connectorId}
       AND status = 'active'
     LIMIT 1
  `
  return rows.length > 0
})
registry.register(plannerConnector)
registry.register(directoryConnector)

const graph = createGraphFetch({ recordAudit: audit.recordAudit.bind(audit) })

const plannerTools = createPlannerTools({
  registry,
  vault,
  graph,
  sql: sql as Parameters<typeof createPlannerTools>[0]['sql'],
  hmacKey: env.CONTINUATION_HMAC_KEY,
  ttls: {
    tasks: env.PLANNER_CACHE_TTL_TASKS_SEC,
    plans: env.PLANNER_CACHE_TTL_PLANS_SEC,
    buckets: env.PLANNER_CACHE_TTL_BUCKETS_SEC,
    staleFallbackMax: env.PLANNER_CACHE_STALE_FALLBACK_MAX_SEC,
  },
  continuationTtlMin: env.CONTINUATION_TTL_MIN,
  batchConcurrency: env.PLANNER_BATCH_CONCURRENCY,
})

const entra = new EntraProvider({
  clientId: env.ENTRA_CLIENT_ID,
  clientSecret: env.ENTRA_CLIENT_SECRET,
})

const app = new Hono().onError(onError)

app.get('/healthz', (c) => c.json({ ok: true }))

app.route(
  '/oauth',
  createOAuthRoutes({
    providers: { entra },
    registry,
    stateStore,
    vault,
    audit,
    redirectBase: env.PUBLIC_BASE_URL,
    // TODO(rls): tenant_user may lack INSERT on tenant.tenants / tenant.tenant_connectors
    // in production. Dev DB connects as `seta` superuser so it works locally.
    // Tracked for J3 follow-up — needs explicit grants or a SECURITY DEFINER helper.
    onConsented: async ({ tenantId, connectorIds, scopesGranted }) => {
      await sql.begin(async (tx) => {
        await tx`
          INSERT INTO tenant.tenants (id, slug, display_name, status)
          VALUES (${tenantId}, ${`t-${tenantId}`}, ${tenantId}, 'active')
          ON CONFLICT (id) DO NOTHING
        `
        for (const connectorId of connectorIds) {
          await tx`
            INSERT INTO tenant.tenant_connectors
              (tenant_id, connector_id, status, consented_at, scope_set)
            VALUES (${tenantId}, ${connectorId}, 'active', now(), ${tx.json(scopesGranted as never)})
            ON CONFLICT (tenant_id, connector_id) DO UPDATE
              SET status       = 'active',
                  consented_at = excluded.consented_at,
                  scope_set    = excluded.scope_set,
                  updated_at   = now()
          `
        }
      })
    },
  }),
)

app.route('/v1/threads', createThreadRoutes(agentMemory))

app.post('/agent/run', async (c: Context) => {
  const tenantId = c.req.header('x-tenant-id')
  const userId = c.req.header('x-user-id')
  if (!tenantId) return c.json({ error: 'X-Tenant-Id header required' }, 400)

  const body = await c.req.json<RunInput>()

  return tenantContext.run(
    { tenantId, ...(userId ? { userId } : {}) },
    () =>
      streamKernelSSE(
        c,
        runKernel(
          { ...PLANNER_AGENT_CONFIG, tools: plannerTools },
          body,
          { adapters: agentRegistry, memory: agentMemory, signal: c.req.raw.signal },
        ),
      ),
  )
})

if (env.NODE_ENV !== 'production') {
  app.post('/v1/tools/invoke', async (c) => {
    const tenantId = c.req.header('x-tenant-id')
    const userId = c.req.header('x-user-id')
    if (!tenantId) return c.json({ error: 'X-Tenant-Id header required' }, 400)

    const body = await c.req.json<{ tool: string; input: unknown }>()
    if (!body.tool) return c.json({ error: 'body.tool required' }, 400)

    const tool = plannerTools.find((t) => t.id === body.tool) as Tool | undefined
    if (!tool) {
      return c.json(
        { error: `unknown tool: ${body.tool}`, available: plannerTools.map((t) => t.id) },
        404,
      )
    }

    const ac = new AbortController()
    const runId = crypto.randomUUID()
    const ctx: ToolExecutionContext = {
      surface: 'direct',
      abortSignal: ac.signal,
      runId,
      requestContext: {
        runId,
        signal: ac.signal,
        retryCount: 0,
        now: () => Date.now(),
        generateId: () => crypto.randomUUID(),
        currentDate: () => new Date(),
      },
    }

    const store = userId ? { tenantId, userId } : { tenantId }
    const result = await tenantContext.run(store, () => tool.execute(body.input as never, ctx))

    return c.json(result)
  })
  logger.info('POST /v1/tools/invoke enabled (dev only)')
}

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info({ port: info.port }, 'api listening')
})

const shutdown = (signal: string) => async () => {
  logger.info({ signal }, 'shutting down')
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await sql.end()
  process.exit(0)
}
process.on('SIGTERM', shutdown('SIGTERM'))
process.on('SIGINT', shutdown('SIGINT'))
