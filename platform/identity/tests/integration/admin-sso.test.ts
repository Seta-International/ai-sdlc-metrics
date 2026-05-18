import { onError } from '@seta/middleware'
import { Hono } from 'hono'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createSsoAdminRoutes, type SsoAdminRoutesDeps } from '../../src/admin-routes'
import type { SsoVariables } from '../../src/middleware'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'
const tenantId = '00000000-0000-4000-8000-0000000000d1'
const tenantId2 = '00000000-0000-4000-8000-0000000000d2'

type AuditEvent = {
  tenantId: string
  actor: unknown
  providerId?: string
  operation: string
  result: 'ok' | 'failure'
  metadata?: Record<string, unknown>
}

function buildApp(sql: postgres.Sql, fetchStub?: typeof fetch) {
  const vault = new Map<string, string>()
  const events: AuditEvent[] = []
  const deps: SsoAdminRoutesDeps = {
    sql,
    audit: {
      recordAudit: async (e) => {
        events.push(e as AuditEvent)
      },
    },
    vault: {
      put: async (t, p, a, b) => {
        vault.set(`${t}:${p}:${a}`, b.accessToken)
      },
      get: async (t, p, a) => {
        const v = vault.get(`${t}:${p}:${a}`)
        return v ? { accessToken: v } : null
      },
      delete: async (t, p, a) => {
        vault.delete(`${t}:${p}:${a}`)
      },
    },
    ...(fetchStub ? { fetchImpl: fetchStub } : {}),
  }
  const app = new Hono<{ Variables: SsoVariables }>().onError(onError)
  app.use('*', async (c, next) => {
    c.set('userId', '00000000-0000-4000-8000-000000000aaa')
    c.set('sessionId', 'sess-1')
    await next()
  })
  app.route('/', createSsoAdminRoutes(deps))
  return { app, vault, events }
}

describe('admin-sso (integration)', () => {
  const sql = postgres(DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} })

  beforeEach(async () => {
    await sql`DELETE FROM auth.sso_email_domains WHERE tenant_id IN (${tenantId}, ${tenantId2}) OR domain = 'acme.com'`
    await sql`DELETE FROM auth.sso_configs WHERE tenant_id IN (${tenantId}, ${tenantId2})`
    await sql`DELETE FROM tenant.tenant_members WHERE tenant_id IN (${tenantId}, ${tenantId2})`
    await sql`DELETE FROM tenant.tenant_connectors WHERE tenant_id IN (${tenantId}, ${tenantId2})`
    await sql`DELETE FROM tenant.tenants WHERE id IN (${tenantId}, ${tenantId2}) OR slug IN ('admin-sso-acme', 'admin-sso-beta')`
    await sql`
      INSERT INTO tenant.tenants (id, slug, display_name) VALUES
        (${tenantId}, 'admin-sso-acme', 'Acme'),
        (${tenantId2}, 'admin-sso-beta', 'Beta')
    `
  })

  afterAll(async () => {
    await sql`DELETE FROM auth.sso_email_domains WHERE tenant_id IN (${tenantId}, ${tenantId2}) OR domain = 'acme.com'`
    await sql`DELETE FROM auth.sso_configs WHERE tenant_id IN (${tenantId}, ${tenantId2})`
    await sql`DELETE FROM tenant.tenant_members WHERE tenant_id IN (${tenantId}, ${tenantId2})`
    await sql`DELETE FROM tenant.tenant_connectors WHERE tenant_id IN (${tenantId}, ${tenantId2})`
    await sql`DELETE FROM tenant.tenants WHERE id IN (${tenantId}, ${tenantId2}) OR slug IN ('admin-sso-acme', 'admin-sso-beta')`
    await sql.end()
  })

  it('PUT creates a row + domains and audits create + domain_added', async () => {
    const { app, events } = buildApp(sql)
    const res = await app.request(`/admin/sso/tenants/${tenantId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'entra',
        config: { entra_tenant_id: 'tid', client_id: 'cid' },
        domains: ['acme.com'],
        clientSecret: 'secret-1',
      }),
    })
    expect(res.status).toBe(200)
    const ops = events.map((e) => e.operation)
    expect(ops).toContain('sso.config_created')
    expect(ops).toContain('sso.domain_added')
  })

  it('PUT rejects a denylist domain', async () => {
    const { app } = buildApp(sql)
    const res = await app.request(`/admin/sso/tenants/${tenantId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'entra',
        config: { entra_tenant_id: 't', client_id: 'c' },
        domains: ['gmail.com'],
        clientSecret: 'sec',
      }),
    })
    expect(res.status).toBe(400)
  })

  it('PUT 409s on a domain owned by another tenant', async () => {
    const { app } = buildApp(sql)
    const first = await app.request(`/admin/sso/tenants/${tenantId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'entra',
        config: { entra_tenant_id: 't', client_id: 'c' },
        domains: ['acme.com'],
        clientSecret: 'sec',
      }),
    })
    expect(first.status).toBe(200)
    const second = await app.request(`/admin/sso/tenants/${tenantId2}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'entra',
        config: { entra_tenant_id: 't', client_id: 'c' },
        domains: ['acme.com'],
        clientSecret: 'sec',
      }),
    })
    expect(second.status).toBe(409)
  })

  it('GET never echoes the client secret and reports hasSecret=true', async () => {
    const { app } = buildApp(sql)
    await app.request(`/admin/sso/tenants/${tenantId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'entra',
        config: { entra_tenant_id: 't', client_id: 'c' },
        domains: ['acme.com'],
        clientSecret: 'topsecret',
      }),
    })
    const res = await app.request(`/admin/sso/tenants/${tenantId}`)
    const body = (await res.json()) as Record<string, unknown>
    expect(JSON.stringify(body)).not.toContain('topsecret')
    expect(body.hasSecret).toBe(true)
  })

  it('POST /test stores last_test_result and audits with the result', async () => {
    const fetchStub: typeof fetch = async (input) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url
      if (url.endsWith('/.well-known/openid-configuration')) {
        return new Response(
          JSON.stringify({
            issuer: 'https://login.microsoftonline.com/tid/v2.0',
            token_endpoint: 'https://login.microsoftonline.com/tid/oauth2/v2.0/token',
            authorization_endpoint: 'x',
            jwks_uri: 'x',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      return new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 })
    }
    const { app, events } = buildApp(sql, fetchStub)
    await app.request(`/admin/sso/tenants/${tenantId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'entra',
        config: { entra_tenant_id: 'tid', client_id: 'cid' },
        domains: ['acme.com'],
        clientSecret: 'sec',
      }),
    })
    const res = await app.request(`/admin/sso/tenants/${tenantId}/test`, { method: 'POST' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { result: string }
    expect(body.result).toBe('ok')
    expect(events.find((e) => e.operation === 'sso.test_run')).toMatchObject({ result: 'ok' })

    const rows = (await sql`
      SELECT last_test_result FROM auth.sso_configs WHERE tenant_id = ${tenantId}
    `) as Array<{ last_test_result: string }>
    expect(rows[0]?.last_test_result).toBe('ok')
  })

  it('DELETE removes the config and clears domains', async () => {
    const { app, vault, events } = buildApp(sql)
    await app.request(`/admin/sso/tenants/${tenantId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'entra',
        config: { entra_tenant_id: 'tid', client_id: 'cid' },
        domains: ['acme.com'],
        clientSecret: 'sec',
      }),
    })
    const res = await app.request(`/admin/sso/tenants/${tenantId}`, { method: 'DELETE' })
    expect(res.status).toBe(200)
    expect(vault.size).toBe(0)
    expect(events.find((e) => e.operation === 'sso.config_deleted')).toBeDefined()
    const after = (await sql`
      SELECT 1 FROM auth.sso_configs WHERE tenant_id = ${tenantId}
    `) as unknown[]
    expect(after).toHaveLength(0)
  })

  it('rotate-secret writes the new secret and audits', async () => {
    const { app, vault, events } = buildApp(sql)
    await app.request(`/admin/sso/tenants/${tenantId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'entra',
        config: { entra_tenant_id: 'tid', client_id: 'cid' },
        domains: [],
        clientSecret: 'old',
      }),
    })
    const res = await app.request(`/admin/sso/tenants/${tenantId}/rotate-secret`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientSecret: 'rotated' }),
    })
    expect(res.status).toBe(200)
    expect(vault.get(`${tenantId}:sso-entra:sso`)).toBe('rotated')
    expect(events.find((e) => e.operation === 'sso.secret_rotated')).toBeDefined()
  })
})
