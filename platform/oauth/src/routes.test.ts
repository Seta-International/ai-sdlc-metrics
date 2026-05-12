import { createAuditWriter } from '@seta/audit'
import { directoryConnector } from '@seta/connector-ms365-directory'
import { plannerConnector } from '@seta/connector-ms365-planner'
import { createConnectorRegistry } from '@seta/connector-registry'
import { onError } from '@seta/middleware'
import { Hono } from 'hono'
import postgres from 'postgres'
import { describe, expect, it, vi } from 'vitest'
import { EnvDekProvider } from './kms.js'
import { EntraProvider } from './providers/entra.js'
import { createOAuthRoutes } from './routes.js'
import { createStateStore } from './state-store.js'
import { createTokenVault } from './vault.js'

const URL = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'

describe('POST /oauth/:provider/consent-url', () => {
  const sql = postgres(URL, { max: 1, prepare: false })
  const registry = createConnectorRegistry()
  registry.register(plannerConnector)
  registry.register(directoryConnector)
  const providers = {
    entra: new EntraProvider({
      clientId: 'client-x',
      clientSecret: 'secret-y',
      ccaFactory: () => ({}) as never,
    }),
  }
  const stateStore = createStateStore(sql)

  const app = new Hono().onError(onError).route(
    '/oauth',
    createOAuthRoutes({
      providers,
      registry,
      stateStore,
      redirectBase: 'https://api.example.com',
    }),
  )

  it('returns a consent URL containing the .default scope and state', async () => {
    const res = await app.request('/oauth/entra/consent-url', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ connectors: ['ms365-planner', 'ms365-directory'] }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { url: string; state: string }
    expect(body.url).toContain('https://login.microsoftonline.com/organizations/v2.0/adminconsent')
    expect(body.url).toContain('scope=https%3A%2F%2Fgraph.microsoft.com%2F.default')
    expect(body.url).toContain(`state=${encodeURIComponent(body.state)}`)
    expect(body.url).toContain(
      'redirect_uri=https%3A%2F%2Fapi.example.com%2Foauth%2Fentra%2Fcallback',
    )
  })

  it('returns 400 for unknown connector id', async () => {
    const res = await app.request('/oauth/entra/consent-url', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ connectors: ['nope'] }),
    })
    expect(res.status).toBe(400)
  })
})

describe('GET /oauth/:provider/callback', () => {
  const sql = postgres(URL, { max: 1, prepare: false })
  const kms = new EnvDekProvider({ keyId: 'local', plaintextKey: Buffer.alloc(32, 13) })
  const vault = createTokenVault({ sql, kms })
  const registry = createConnectorRegistry()
  registry.register(plannerConnector)
  registry.register(directoryConnector)

  const customerTenantId = '00000000-0000-0000-0000-000000000c01'

  const fakeCca = () => ({
    acquireTokenByClientCredential: vi.fn().mockResolvedValue({
      accessToken: 'app-only-token',
      expiresOn: new Date(Date.now() + 3600_000),
      scopes: ['https://graph.microsoft.com/.default'],
      account: { tenantId: customerTenantId, homeAccountId: `cred:${customerTenantId}` },
      tenantId: customerTenantId,
    }),
  })

  const providers = {
    entra: new EntraProvider({
      clientId: 'client-x',
      clientSecret: 'secret-y',
      ccaFactory: fakeCca as never,
    }),
  }
  const stateStore = createStateStore(sql)
  const audit = createAuditWriter(sql)
  const onConsented = vi.fn().mockResolvedValue(undefined)

  const app = new Hono().onError(onError).route(
    '/oauth',
    createOAuthRoutes({
      providers,
      registry,
      stateStore,
      vault,
      audit,
      redirectBase: 'https://api.example.com',
      onConsented,
    }),
  )

  it('completes the callback: state consumed, app-only token stored, audit written', async () => {
    const state = await stateStore.mint({
      providerId: 'entra',
      connectorIds: ['ms365-planner', 'ms365-directory'],
    })

    const res = await app.request(
      `/oauth/entra/callback?admin_consent=True&tenant=${customerTenantId}&state=${state}`,
    )
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Connected')

    const bundle = await vault.get(customerTenantId, 'entra', 'app:client-x')
    expect(bundle?.accessToken).toBe('app-only-token')

    expect(onConsented).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: customerTenantId,
        connectorIds: ['ms365-planner', 'ms365-directory'],
      }),
    )

    const rows = await sql<
      Array<{ operation: string }>
    >`SELECT operation FROM audit.audit_log WHERE tenant_id = ${customerTenantId} ORDER BY ts DESC LIMIT 1`
    expect(rows[0]?.operation).toBe('oauth.admin_consent')

    await sql`DELETE FROM oauth.oauth_tokens WHERE tenant_id = ${customerTenantId}`
    await sql`DELETE FROM audit.audit_log WHERE tenant_id = ${customerTenantId}`
    await sql.end()
  })

  it('rejects when tenant query param mismatches token tid', async () => {
    const sql2 = postgres(URL, { max: 1, prepare: false })
    const ss2 = createStateStore(sql2)
    const state = await ss2.mint({ providerId: 'entra', connectorIds: ['ms365-planner'] })

    const audit2 = createAuditWriter(sql2)
    const app2 = new Hono().onError(onError).route(
      '/oauth',
      createOAuthRoutes({
        providers,
        registry,
        stateStore: ss2,
        vault,
        audit: audit2,
        redirectBase: 'https://api.example.com',
      }),
    )

    // Token returns tid=customerTenantId, but tenant param is a different UUID
    const spoofedTenantId = '00000000-0000-0000-0000-0000000005f0'
    const res = await app2.request(
      `/oauth/entra/callback?admin_consent=True&tenant=${spoofedTenantId}&state=${state}`,
    )
    expect(res.status).toBe(400)

    await sql2`DELETE FROM audit.audit_log WHERE tenant_id = ${spoofedTenantId}`
    await sql2.end()
  })
})
