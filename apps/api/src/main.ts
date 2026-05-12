import { serve } from '@hono/node-server'
import { createAuditWriter } from '@seta/audit'
import { directoryConnector } from '@seta/connector-ms365-directory'
import { plannerConnector } from '@seta/connector-ms365-planner'
import { createConnectorRegistry } from '@seta/connector-registry'
import { createPool } from '@seta/db'
import { onError } from '@seta/middleware'
import {
  createKmsClient,
  createOAuthRoutes,
  createStateStore,
  createTokenVault,
  EntraProvider,
} from '@seta/oauth'
import { logger } from '@seta/observability'
import { Hono } from 'hono'
import { env } from './env'

const sql = createPool(env.DATABASE_URL)
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
