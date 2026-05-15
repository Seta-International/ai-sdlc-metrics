import { serve } from '@hono/node-server'
import {
  createAgentRouter,
  createToolRegistry,
  seedAgentProfiles,
  type ThreadStore,
} from '@seta/agent-server'
import {
  ANALYTICS_PROFILE_SEED,
  createAnalyticsTools,
  refreshAnalyticsViews,
} from '@seta/analytics'
import { createAuditWriter } from '@seta/audit'
import { directoryConnector } from '@seta/connector-ms365-directory'
import {
  createEtagStore,
  createPlannerCache,
  createPlannerClient,
  createPlannerSyncWorker,
  plannerConnector,
} from '@seta/connector-ms365-planner'
import { createConnectorAdminRoutes, createConnectorRegistry } from '@seta/connector-registry'
import {
  createSessionStore,
  createSsoRoutes,
  EntraSsoProvider,
  GoogleSsoProvider,
  isSuperadmin,
  requireSession,
} from '@seta/identity'
import { onError, rateLimit, Unauthorized } from '@seta/middleware'
import { createGraphFetch } from '@seta/ms-graph'
import { mockTeamsHandler, routes as teamsRoutes } from '@seta/ms-teams'
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
import {
  createMeContextProvider,
  createTenancyRoutes,
  findOrAttachUser,
  getActiveTenantIds,
  isConnectorConsented,
  recordConsent,
  type TenantMembershipRole,
  tenantContext,
} from '@seta/tenancy'
import type { Context } from 'hono'
import { Hono } from 'hono'
import { agentMemory, agentRegistry } from './agent'
import { sql } from './db'
import { deployedApps, enabledSsoProviders, env, superadminEmails } from './env'
import { lastAppMiddleware, verifyLastApp } from './last-app-middleware'
import { runSeed } from './seed'

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

const registry = createConnectorRegistry(async (tenantId, connectorId) =>
  isConnectorConsented(sql as never, tenantId, connectorId),
)
registry.register(plannerConnector)
registry.register(directoryConnector)

const entra = new EntraProvider({
  clientId: env.ENTRA_CLIENT_ID,
  clientSecret: env.ENTRA_CLIENT_SECRET,
})

// ── SSO providers + routes ────────────────────────────────────────────────────

const entraSso = new EntraSsoProvider({
  clientId: env.ENTRA_CLIENT_ID,
  clientSecret: env.ENTRA_CLIENT_SECRET,
  tenant: env.ENTRA_SSO_TENANT,
})
const googleSso = new GoogleSsoProvider({
  clientId: env.GOOGLE_CLIENT_ID,
  clientSecret: env.GOOGLE_CLIENT_SECRET,
})

const meContext = createMeContextProvider({
  sql: sql as never,
  deployedApps: deployedApps(),
})

const sso = createSsoRoutes({
  providers: { entra: entraSso, google: googleSso },
  enabledProviders: enabledSsoProviders(),
  sql,
  sessionCookie: {
    name: 'seta_sess',
    hmacKey: env.SESSION_HMAC_KEY,
    ttlSec: env.SESSION_TTL_SEC,
    secure: env.NODE_ENV === 'production',
  },
  redirectBase: env.PUBLIC_BASE_URL,
  meContext,
  tenancy: { findOrAttachUser: (uid) => findOrAttachUser(sql as never, uid) },
  verifyLastApp: (raw) => verifyLastApp(raw, env.SESSION_HMAC_KEY),
})

// ── Tenancy routes ────────────────────────────────────────────────────────────

const sessionStore = createSessionStore(sql)
const requireSessionMiddleware = requireSession({
  cookieName: 'seta_sess',
  hmacKey: env.SESSION_HMAC_KEY,
  sessionStore,
})

const tenancyRoutes = createTenancyRoutes({
  sql: sql as never,
  requireSession: requireSessionMiddleware,
  membershipLookup: async (userId: string) => {
    const rows = (await sql`
      SELECT role FROM tenant.tenant_members
      WHERE user_id = ${userId} AND tenant_id = ${tenantContext.getTenantId()}
      LIMIT 1
    `) as Array<{ role: TenantMembershipRole }>
    return rows[0] ?? null
  },
  invalidateUserSessions: (uid: string) => sessionStore.deleteByUserId(uid),
  isSuperadmin: (uid: string) => isSuperadmin(sql as never, uid),
  audit,
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

const threadStore: ThreadStore = {
  recall: agentMemory.recall.bind(agentMemory),
  saveTurn: agentMemory.saveTurn.bind(agentMemory),
  getWorkingMemory: agentMemory.getWorkingMemory.bind(agentMemory),
  updateWorkingMemory: agentMemory.updateWorkingMemory.bind(agentMemory),
  listThreads: async () => {
    const result = await agentMemory.listThreads()
    return result.threads
  },
  getThread: async (threadId) => {
    const result = await agentMemory.recall({ threadId, scope: 'thread' })
    return result.messages
  },
  deleteThread: agentMemory.deleteThread.bind(agentMemory),
}

// ── Agent-server routes ───────────────────────────────────────────────────────

const agentRouter = createAgentRouter({
  sql: sql as never,
  toolRegistry,
  memory: threadStore,
  workflowEngine,
  adapters: agentRegistry,
})

// ── Hono app ──────────────────────────────────────────────────────────────────

const app = new Hono().onError(onError)

app.use(
  '*',
  lastAppMiddleware({ hmacKey: env.SESSION_HMAC_KEY, secure: env.NODE_ENV === 'production' }),
)

app.get('/healthz', (c) => c.json({ ok: true }))

const ipKey = (c: Context) => c.req.header('x-forwarded-for') ?? 'anon'
const userKey = (c: Context) => (c.get('userId') as string | undefined) ?? 'anon'

app.use('/sso/login/*', rateLimit({ rps: 5, burst: 20, key: ipKey }))
app.use('/sso/callback/*', rateLimit({ rps: 5, burst: 30, key: ipKey }))
app.use('/members*', rateLimit({ rps: 10, burst: 30, key: userKey }))
app.use('/admin/*', rateLimit({ rps: 10, burst: 30, key: userKey }))

app.route('/', sso)

app.route(
  '/oauth',
  createOAuthRoutes({
    providers: { entra },
    registry,
    stateStore,
    vault,
    audit,
    redirectBase: env.PUBLIC_BASE_URL,
    onConsented: async ({ tenantId, connectorIds, scopesGranted }) =>
      recordConsent(sql as never, { tenantId, connectorIds, scopesGranted }),
    onConsentRedirect: ({ tenantId, connectorIds, ok, error }) => {
      const cid = connectorIds[0] ?? 'unknown'
      const params = new URLSearchParams({ ok: ok ? '1' : '0' })
      if (error) params.set('error', error)
      return `${env.PUBLIC_STUDIO_URL}/studio/connectors/${cid}/consent?${params.toString()}`
    },
  }),
)

// Shared with createOAuthRoutes — same provider, same state store, same union.
const buildConsentUrl: Parameters<typeof createConnectorAdminRoutes>[0]['buildConsentUrl'] =
  async ({ tenantId, providerId, connectorIds, tenantHint }) => {
    const providers: Record<string, typeof entra> = { entra }
    const provider = providers[providerId]
    if (!provider) throw new Error(`unknown provider '${providerId}'`)
    const union = registry.scopeUnion(connectorIds)
    const state = await stateStore.mint({ providerId, connectorIds })
    const url = provider.buildAdminConsentUrl({
      scopes: union.application.concat(union.delegated),
      redirectUri: `${env.PUBLIC_BASE_URL}/oauth/${providerId}/callback`,
      state,
      tenantHint: tenantHint ?? tenantId,
    })
    return { url, state }
  }

app.route(
  '/',
  createConnectorAdminRoutes({
    registry,
    isConsented: async (tenantId, connectorId) =>
      isConnectorConsented(sql as never, tenantId, connectorId),
    lookupMembership: async ({ userId, tenantId }) => {
      const rows = (await sql`
        SELECT role FROM tenant.tenant_members
        WHERE user_id = ${userId} AND tenant_id = ${tenantId}
        LIMIT 1
      `) as Array<{ role: 'owner' | 'admin' | 'member' }>
      return rows[0] ?? null
    },
    buildConsentUrl,
  }),
)

app.route('/', tenancyRoutes)

app.route('/agent', agentRouter)

app.route(
  '/teams',
  teamsRoutes(mockTeamsHandler, {
    botId: env.MS_BOT_ID,
    botSecret: env.MS_BOT_SECRET,
    botTenantId: env.MS_BOT_TENANT_ID,
    skipJwtVerify: env.TEAMS_SKIP_JWT_VERIFY,
  }),
)

// ── Boot: seed agent profiles ─────────────────────────────────────────────────

async function boot() {
  await runSeed({
    sql: sql as never,
    tenant: {
      id: env.SETA_SEED_TENANT_ID,
      slug: env.SETA_SEED_TENANT_SLUG,
      name: env.SETA_SEED_TENANT_NAME,
    },
    superadminEmails: superadminEmails(),
  })
  logger.info({ tenantId: env.SETA_SEED_TENANT_ID }, 'tenant seed applied')

  await seedAgentProfiles(sql as never, [PLANNER_PROFILE_SEED, ANALYTICS_PROFILE_SEED])
  logger.info('agent profiles seeded')

  const taskIndexer = createTaskIndexer({
    sql: sql as never,
    embeddings: embeddingsStub,
    vector: embeddingsStub,
  })

  const getAppToken = async (tenantId: string): Promise<string> => {
    const bundle = await entra.acquireAppOnly(tenantId, ['https://graph.microsoft.com/.default'])
    return bundle.accessToken
  }

  const syncWorker = createPlannerSyncWorker({
    db: sql as never,
    graph,
    getAppToken,
    intervalMs: env.PLANNER_SYNC_INTERVAL_MS,
    afterSync: async (changedTaskIds) => {
      const tenantId = tenantContext.getTenantId()
      if (changedTaskIds.length > 0) {
        await taskIndexer.indexTasks(tenantId, changedTaskIds)
      }
      await refreshAnalyticsViews(sql as never)
    },
  })

  const tenantIds = await getActiveTenantIds(sql as never)
  syncWorker.start(tenantIds)
  logger.info({ tenants: tenantIds.length }, 'planner sync worker started')
}

// ── Server start ──────────────────────────────────────────────────────────────

export function buildApp() {
  return app
}

export { sql, sso }

const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
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
}
