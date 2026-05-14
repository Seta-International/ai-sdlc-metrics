import { serve } from '@hono/node-server'
import { createAgentRouter, createToolRegistry, seedAgentProfiles } from '@seta/agent-server'
import { ANALYTICS_PROFILE_SEED, createAnalyticsTools } from '@seta/analytics'
import { createAuditWriter } from '@seta/audit'
import { directoryConnector } from '@seta/connector-ms365-directory'
import {
  createEtagStore,
  createPlannerCache,
  createPlannerClient,
  createPlannerSyncWorker,
  plannerConnector,
} from '@seta/connector-ms365-planner'
import { createConnectorRegistry } from '@seta/connector-registry'
import { onError, Unauthorized } from '@seta/middleware'
import { createGraphFetch } from '@seta/ms-graph'
import { createTeamsHandler } from '@seta/ms-teams'
import {
  createKmsClient,
  createOAuthRoutes,
  createStateStore,
  createTokenVault,
  EntraProvider,
} from '@seta/oauth'
import { logger } from '@seta/observability'
import {
  createContinuationStore,
  createPlannerTools,
  createTaskIndexer,
  PLANNER_PROFILE_SEED,
} from '@seta/planner'
import { tenantContext } from '@seta/tenant'
import { Hono } from 'hono'
import { agentMemory, agentRegistry } from './agent'
import { sql } from './db'
import { env } from './env'

// ── Infrastructure ────────────────────────────────────────────────────────────

const kms = createKmsClient({
  KMS_PROVIDER: env.KMS_PROVIDER,
  ...(env.AWS_REGION !== undefined && { AWS_REGION: env.AWS_REGION }),
  ...(env.KMS_KEY_ARN !== undefined && { KMS_KEY_ARN: env.KMS_KEY_ARN }),
  ...(env.DEV_DEK_BASE64 !== undefined && { DEV_DEK_BASE64: env.DEV_DEK_BASE64 }),
})
const vault = createTokenVault({ sql, kms })
const stateStore = createStateStore(sql)
const audit = createAuditWriter(sql)
const graph = createGraphFetch({ recordAudit: audit.recordAudit.bind(audit) })

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

const entra = new EntraProvider({
  clientId: env.ENTRA_CLIENT_ID,
  clientSecret: env.ENTRA_CLIENT_SECRET,
})

// ── Tool registry ─────────────────────────────────────────────────────────────

const embeddingsStub = {
  embed: async (): Promise<never> => {
    throw new Error('No embeddings provider configured')
  },
} as never

const continuationStore = createContinuationStore({
  sql: sql as never,
  hmacKey: env.CONTINUATION_HMAC_KEY,
  ttlMin: env.CONTINUATION_TTL_MIN,
})
const etagStore = createEtagStore(sql as never)

const tokenForUser = async (tenantId: string, userId: string) => {
  const bundle = await vault.get(tenantId, 'entra', `user:${userId}`)
  if (!bundle) throw new Unauthorized('no token for user')
  return { accessToken: bundle.accessToken }
}

const buildClient = (token: string) =>
  createPlannerClient({
    graph,
    token,
    actor: { type: 'user', userId: tenantContext.getUserId() ?? 'unknown' },
  })

const buildCache = (client: Parameters<typeof createPlannerCache>[0]['client']) =>
  createPlannerCache({
    sql: sql as never,
    client,
    ttlTasksSec: env.PLANNER_CACHE_TTL_TASKS_SEC,
    ttlPlansSec: env.PLANNER_CACHE_TTL_PLANS_SEC,
    ttlBucketsSec: env.PLANNER_CACHE_TTL_BUCKETS_SEC,
    staleFallbackMaxSec: env.PLANNER_CACHE_STALE_FALLBACK_MAX_SEC,
  })

const toolRegistry = createToolRegistry()

const plannerTools = createPlannerTools({
  sql: sql as never,
  registry,
  tokenForUser,
  buildClient,
  buildCache,
  buildGraph: () => graph,
  continuationStore,
  etagStore,
  embeddings: embeddingsStub,
  vector: embeddingsStub,
  ttlMinutes: env.CONTINUATION_TTL_MIN,
  batchConcurrency: env.PLANNER_BATCH_CONCURRENCY,
})

const analyticsTools = createAnalyticsTools({ sql: sql as never })

for (const [id, tool] of Object.entries(plannerTools)) toolRegistry.register(id, tool)
for (const [id, tool] of Object.entries(analyticsTools)) toolRegistry.register(id, tool)

logger.info('tool registry populated')

// ── Workflow engine (stub) ────────────────────────────────────────────────────

const workflowEngine = {
  getStatus: async (_runId: string) => ({ status: 'unknown' }),
  resume: async (
    _runId: string,
    _body: { action: 'confirm' | 'cancel'; payload?: Record<string, unknown> },
  ) => {},
} as never

// ── Agent-server routes ───────────────────────────────────────────────────────

const agentRouter = createAgentRouter({
  sql: sql as never,
  toolRegistry,
  memory: agentMemory,
  workflowEngine,
  adapters: agentRegistry,
})

// ── Teams handler ─────────────────────────────────────────────────────────────

const teamsHandler = createTeamsHandler({
  sql: sql as never,
  toolRegistry,
  memory: agentMemory,
  workflowEngine,
  adapters: agentRegistry,
})

// ── Hono app ──────────────────────────────────────────────────────────────────

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

app.route('/agent', agentRouter)

app.post('/teams/messages', async (c) => {
  const tenantId = c.req.header('x-tenant-id') ?? tenantContext.getTenantId()
  const userId = c.req.header('x-user-id') ?? ''
  const activity = await c.req.json()
  if (activity.type !== 'message') return c.json({ ok: true })
  const result = await teamsHandler(activity, { tenantId, userId })
  return c.json(result)
})

// ── Boot: seed agent profiles ─────────────────────────────────────────────────

async function boot() {
  await seedAgentProfiles(sql as never, [PLANNER_PROFILE_SEED, ANALYTICS_PROFILE_SEED])
  logger.info('agent profiles seeded')

  const taskIndexer = createTaskIndexer({
    sql: sql as never,
    embeddings: embeddingsStub,
    vector: embeddingsStub,
  })

  const getActiveTenantIds = async (): Promise<string[]> => {
    const rows = (await sql`
      SELECT DISTINCT tenant_id::text FROM tenant.tenants WHERE status = 'active'
    `) as Array<{ tenant_id: string }>
    return rows.map((r) => r.tenant_id)
  }

  const getAppToken = async (tenantId: string): Promise<string> => {
    const bundle = await entra.acquireAppOnly(tenantId, ['https://graph.microsoft.com/.default'])
    return bundle.accessToken
  }

  const syncWorker = createPlannerSyncWorker({
    db: sql as never,
    graph,
    getAppToken,
    intervalMs: env.PLANNER_SYNC_INTERVAL_MS,
    afterSync: async (tenantId, changedTaskIds) => {
      if (changedTaskIds.length > 0) {
        await taskIndexer.indexTasks(tenantId, changedTaskIds)
      }
      await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_assignee_workload`
      await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_plan_weekly_velocity`
    },
  })

  const tenantIds = await getActiveTenantIds()
  syncWorker.start(tenantIds)
  logger.info({ tenants: tenantIds.length }, 'planner sync worker started')
}

// ── Server start ──────────────────────────────────────────────────────────────

const server = serve({ fetch: app.fetch, port: env.PORT }, async (info) => {
  logger.info({ port: info.port }, 'api listening')
  await boot().catch((err) => logger.error({ err }, 'boot failed'))
})

const shutdown = (signal: string) => async () => {
  logger.info({ signal }, 'shutting down')
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await sql.end()
  process.exit(0)
}
process.on('SIGTERM', shutdown('SIGTERM'))
process.on('SIGINT', shutdown('SIGINT'))
