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
  createSsoAdminRoutes,
  createSsoRoutes,
  isSuperadmin,
  requireSession,
  requireSuperadmin,
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
import { createContinuationStore, createPlannerTools, PLANNER_PROFILE_SEED } from '@seta/planner'
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
import { deployedApps, env } from './env'
import { lastAppMiddleware, verifyLastApp } from './last-app-middleware'

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

const platformConnectorOAuth = new EntraProvider({
  clientId: env.PLATFORM_CONNECTOR_CLIENT_ID,
  clientSecret: env.PLATFORM_CONNECTOR_CLIENT_SECRET,
})

// ── SSO routes ────────────────────────────────────────────────────────────────

const meContext = createMeContextProvider({
  sql: sql as never,
  deployedApps: deployedApps(),
})

const sso = createSsoRoutes({
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
  getClientSecret: async ({ tenantId, vaultId }) => {
    if (!vaultId) throw new Error('sso config has no secret_vault_id')
    const [providerId, accountKey] = vaultId.split(':') as ['sso-entra', string]
    const bundle = await vault.get(tenantId, providerId, accountKey)
    if (!bundle) throw new Error(`vault miss for ${tenantId}/${vaultId}`)
    return bundle.accessToken
  },
  getTenantBrief: async (tenantId) => {
    const rows =
      (await sql`SELECT slug, display_name FROM tenant.tenants WHERE id = ${tenantId} LIMIT 1`) as Array<{
        slug: string
        display_name: string
      }>
    const r = rows[0]
    return r ? { slug: r.slug, displayName: r.display_name } : null
  },
  autoJoinOnDomain: async ({ userId, tenantId }) => {
    await sql`
      INSERT INTO tenant.tenant_members (user_id, tenant_id, role, source)
      VALUES (${userId}, ${tenantId}, 'member', 'sso_domain_match')
      ON CONFLICT DO NOTHING
    `
  },
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

if (env.NODE_ENV === 'development') {
  app.get('/', (c) => c.redirect('/console/'))

  const FRONTEND_PORTS: Record<string, number> = {
    console: 5174,
    studio: 5180,
  }
  for (const [prefix, port] of Object.entries(FRONTEND_PORTS)) {
    app.all(`/${prefix}/*`, async (c) => {
      const target = `http://localhost:${port}${c.req.path}${c.req.url.includes('?') ? `?${c.req.url.split('?')[1]}` : ''}`
      const init: RequestInit = {
        method: c.req.method,
        headers: c.req.raw.headers,
      }
      if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
        init.body = c.req.raw.body
        ;(init as { duplex?: string }).duplex = 'half'
      }
      const upstream = await fetch(target, init)
      return upstream
    })
    app.all(`/${prefix}`, async (c) => {
      const target = `http://localhost:${port}/${prefix}`
      return fetch(target, { method: c.req.method, headers: c.req.raw.headers })
    })
  }
}

app.get('/healthz', (c) => c.json({ ok: true }))

const ipKey = (c: Context) => c.req.header('x-forwarded-for') ?? 'anon'
const userKey = (c: Context) => (c.get('userId') as string | undefined) ?? 'anon'

app.use('/sso/login/*', rateLimit({ rps: 5, burst: 20, key: ipKey }))
app.use('/sso/callback/*', rateLimit({ rps: 5, burst: 30, key: ipKey }))
app.use('/members*', rateLimit({ rps: 10, burst: 30, key: userKey }))
app.use('/admin/*', rateLimit({ rps: 10, burst: 30, key: userKey }))

app.route('/', sso)

const ssoAdmin = createSsoAdminRoutes({ sql, audit, vault })
app.use(
  '/admin/sso/*',
  requireSessionMiddleware,
  requireSuperadmin({ lookup: (uid) => isSuperadmin(sql as never, uid) }),
)
app.route('/', ssoAdmin)

app.route(
  '/oauth',
  createOAuthRoutes({
    providers: { entra: platformConnectorOAuth },
    registry,
    stateStore,
    vault,
    audit,
    redirectBase: env.PUBLIC_BASE_URL,
    onConsented: async ({ tenantId, connectorIds, scopesGranted }) =>
      recordConsent(sql as never, { tenantId, connectorIds, scopesGranted }),
    onConsentRedirect: ({ connectorIds, ok, error }) => {
      const cid = connectorIds[0] ?? 'unknown'
      const params = new URLSearchParams({ ok: ok ? '1' : '0' })
      if (error) params.set('error', error)
      return `${env.PUBLIC_BASE_URL}/console/connectors/${cid}/consent?${params.toString()}`
    },
  }),
)

// Shared with createOAuthRoutes — same provider, same state store, same union.
const buildConsentUrl: Parameters<typeof createConnectorAdminRoutes>[0]['buildConsentUrl'] =
  async ({ tenantId, providerId, connectorIds, tenantHint }) => {
    const providers: Record<string, typeof platformConnectorOAuth> = {
      entra: platformConnectorOAuth,
    }
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
    sql: sql as never,
  }),
)

// ── Boot: seed agent profiles ─────────────────────────────────────────────────

async function boot() {
  await seedAgentProfiles(sql, [PLANNER_PROFILE_SEED, ANALYTICS_PROFILE_SEED])
  logger.info('agent profiles seeded')

  const getAppToken = async (tenantId: string): Promise<string> => {
    const bundle = await platformConnectorOAuth.acquireAppOnly(tenantId, [
      'https://graph.microsoft.com/.default',
    ])
    return bundle.accessToken
  }

  const syncWorker = createPlannerSyncWorker({
    db: sql as never,
    graph,
    getAppToken,
    intervalMs: env.PLANNER_SYNC_INTERVAL_MS,
    afterSync: async (_changedTaskIds) => {
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
