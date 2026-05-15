import { createAuditWriter } from '@seta/audit'
import { type ConnectorDefinition, createConnectorRegistry } from '@seta/connector-registry'
import { onError } from '@seta/middleware'
import { Hono } from 'hono'
import postgres from 'postgres'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { EnvDekProvider } from './kms'
import { EntraProvider } from './providers/entra'
import { createOAuthRoutes } from './routes'
import { createStateStore } from './state-store'
import { createTokenVault } from './vault'

// Test-only fixture connectors. We intentionally do not import the real
// modules/connectors/* packages here: platform/* must not depend on modules/*.
// These also break the turbo build cycle (@seta/oauth -> @seta/connector-ms365-planner
// -> @seta/ms-graph -> @seta/oauth).
const plannerConnector: ConnectorDefinition = {
  id: 'ms365-planner',
  providerId: 'entra',
  displayName: 'Microsoft 365 Planner',
  description: 'fixture',
  customerFacingRationale: 'fixture',
  requiredScopes: {
    delegated: ['Tasks.ReadWrite', 'Group.ReadWrite.All', 'Group.Read.All'],
    application: ['Tasks.Read.All', 'Group.Read.All'],
  },
  capabilities: { syncable: true, writes: true },
}
const directoryConnector: ConnectorDefinition = {
  id: 'ms365-directory',
  providerId: 'entra',
  displayName: 'Microsoft 365 Directory',
  description: 'fixture',
  customerFacingRationale: 'fixture',
  requiredScopes: {
    delegated: ['User.Read'],
    application: ['User.Read.All', 'Group.Read.All'],
  },
  capabilities: { syncable: true, writes: false },
}

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

  afterAll(async () => {
    await sql.end()
  })

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

  afterAll(async () => {
    await sql.end()
  })

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
  })

  it('redirects to onConsentRedirect URL when configured', async () => {
    const sql3 = postgres(URL, { max: 1, prepare: false })
    const ss3 = createStateStore(sql3)
    const state = await ss3.mint({ providerId: 'entra', connectorIds: ['ms365-planner'] })

    const onConsentRedirect = vi
      .fn()
      .mockImplementation(
        ({
          tenantId,
          connectorIds,
          ok,
        }: {
          tenantId: string
          connectorIds: string[]
          ok: boolean
        }) =>
          `https://studio.example.com/tenants/${tenantId}/connectors/${connectorIds[0]}/consent?ok=${ok ? 1 : 0}`,
      )

    const app3 = new Hono().onError(onError).route(
      '/oauth',
      createOAuthRoutes({
        providers,
        registry,
        stateStore: ss3,
        vault,
        audit: createAuditWriter(sql3),
        redirectBase: 'https://api.example.com',
        onConsentRedirect,
      }),
    )

    const res = await app3.request(
      `/oauth/entra/callback?admin_consent=True&tenant=${customerTenantId}&state=${state}`,
    )
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(
      `https://studio.example.com/tenants/${customerTenantId}/connectors/ms365-planner/consent?ok=1`,
    )
    expect(onConsentRedirect).toHaveBeenCalledWith({
      tenantId: customerTenantId,
      connectorIds: ['ms365-planner'],
      ok: true,
    })

    await sql3`DELETE FROM oauth.oauth_tokens WHERE tenant_id = ${customerTenantId}`
    await sql3`DELETE FROM audit.audit_log WHERE tenant_id = ${customerTenantId}`
    await sql3.end()
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

describe('POST /oauth/:provider/revoke', () => {
  it('deletes the vault row and audits revocation', async () => {
    const sql = postgres(URL, { max: 1, prepare: false })
    const kms = new EnvDekProvider({ keyId: 'local', plaintextKey: Buffer.alloc(32, 13) })
    const vault = createTokenVault({ sql, kms })
    const registry = createConnectorRegistry()
    registry.register(plannerConnector)
    const providers = {
      entra: new EntraProvider({
        clientId: 'client-x',
        clientSecret: 'secret-y',
        ccaFactory: () => ({}) as never,
      }),
    }
    const stateStore = createStateStore(sql)
    const audit = createAuditWriter(sql)

    const app = new Hono().onError(onError).route(
      '/oauth',
      createOAuthRoutes({
        providers,
        registry,
        stateStore,
        vault,
        audit,
        redirectBase: 'https://api.example.com',
      }),
    )

    const tenantId = '08120700-f459-4a90-9b53-9501f06bb842'
    await vault.put(tenantId, 'entra', 'app:client-x', {
      accessToken: 'tok-x',
      refreshToken: null,
      scopes: ['https://graph.microsoft.com/.default'],
      expiresAt: new Date(Date.now() + 3600_000),
      meta: { tid: tenantId },
    })

    const res = await app.request('/oauth/entra/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tenantId, partitionKey: 'app:client-x' }),
    })
    expect(res.status).toBe(200)

    expect(await vault.get(tenantId, 'entra', 'app:client-x')).toBeNull()

    const rows = await sql<
      Array<{ operation: string }>
    >`SELECT operation FROM audit.audit_log WHERE tenant_id = ${tenantId} ORDER BY ts DESC LIMIT 1`
    expect(rows[0]?.operation).toBe('oauth.revoke_manual')

    await sql`DELETE FROM audit.audit_log WHERE tenant_id = ${tenantId}`
    await sql.end()
  })
})

describe('POST /oauth/:provider/exchange-obo', () => {
  it('stores a per-user OBO token bundle', async () => {
    const sql = postgres(URL, { max: 1, prepare: false })
    const kms = new EnvDekProvider({ keyId: 'local', plaintextKey: Buffer.alloc(32, 13) })
    const vault = createTokenVault({ sql, kms })
    const registry = createConnectorRegistry()
    registry.register(plannerConnector)
    const audit = createAuditWriter(sql)

    const tenantId = '854f1c0f-edaf-4d95-81f5-c5c66662c512'

    const fakeCca = () => ({
      acquireTokenOnBehalfOf: vi.fn().mockResolvedValue({
        accessToken: 'obo-token',
        expiresOn: new Date(Date.now() + 3600_000),
        scopes: ['https://graph.microsoft.com/Tasks.ReadWrite'],
        account: { homeAccountId: 'user-home-1', tenantId },
        tenantId,
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

    const app = new Hono().onError(onError).route(
      '/oauth',
      createOAuthRoutes({
        providers,
        registry,
        stateStore,
        vault,
        audit,
        redirectBase: 'https://api.example.com',
      }),
    )

    const res = await app.request('/oauth/entra/exchange-obo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenantId,
        userAssertion: 'user-assertion-xyz',
        scopes: ['https://graph.microsoft.com/Tasks.ReadWrite'],
      }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; homeAccountId: string }
    expect(body.homeAccountId).toBe('user-home-1')

    const bundle = await vault.get(tenantId, 'entra', 'user:user-home-1')
    expect(bundle?.accessToken).toBe('obo-token')

    await sql`DELETE FROM oauth.oauth_tokens WHERE tenant_id = ${tenantId}`
    await sql`DELETE FROM audit.audit_log WHERE tenant_id = ${tenantId}`
    await sql.end()
  })
})
