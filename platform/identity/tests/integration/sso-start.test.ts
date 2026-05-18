import { onError } from '@seta/middleware'
import { Hono } from 'hono'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createSsoRoutes } from '../../src/routes'
import { upsertSsoConfig, upsertSsoEmailDomain } from '../../src/sso-config-repo'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'
const HMAC_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const tenantId = '00000000-0000-4000-8000-0000000000a2'
const slug = 'sso-start-acme'

describe('POST /sso/start (integration)', () => {
  const sql = postgres(DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} })

  beforeEach(async () => {
    await sql`DELETE FROM auth.sso_email_domains WHERE tenant_id = ${tenantId} OR domain = 'acme.com'`
    await sql`DELETE FROM auth.sso_configs WHERE tenant_id = ${tenantId}`
    await sql`DELETE FROM tenant.tenants WHERE id = ${tenantId} OR slug = ${slug}`
    await sql`INSERT INTO tenant.tenants (id, slug, display_name) VALUES (${tenantId}, ${slug}, 'Acme')`
    await upsertSsoConfig(sql, {
      tenantId,
      provider: 'entra',
      config: { entra_tenant_id: '11111111-2222-3333-4444-555555555555', client_id: 'cid' },
      secretVaultId: 'sso-entra:sso',
      createdByUserId: null,
    })
    await upsertSsoEmailDomain(sql, { domain: 'acme.com', tenantId })
  })
  afterAll(async () => {
    await sql`DELETE FROM auth.sso_email_domains WHERE tenant_id = ${tenantId} OR domain = 'acme.com'`
    await sql`DELETE FROM auth.sso_configs WHERE tenant_id = ${tenantId}`
    await sql`DELETE FROM tenant.tenants WHERE id = ${tenantId} OR slug = ${slug}`
    await sql.end()
  })

  it('returns a tenant-specific authorize URL with login_hint, sets a signed state cookie', async () => {
    const app = new Hono().onError(onError)
    app.route(
      '/',
      createSsoRoutes({
        sql,
        sessionCookie: { name: 'seta_sess', hmacKey: HMAC_KEY, ttlSec: 3600, secure: false },
        redirectBase: 'http://localhost:8080',
        meContext: { resolve: async () => ({ tenant: null, isSuperadmin: false, apps: [] }) },
        tenancy: { findOrAttachUser: async () => 'attached' },
        getClientSecret: async () => 'fake-secret',
        getTenantBrief: async () => ({ slug, displayName: 'Acme' }),
        autoJoinOnDomain: async () => {},
      }),
    )
    const res = await app.request('/sso/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'alice@acme.com', returnTo: '/dashboard' }),
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as { url: string }
    const u = new URL(json.url)
    expect(u.origin).toBe('https://login.microsoftonline.com')
    expect(u.pathname).toBe('/11111111-2222-3333-4444-555555555555/oauth2/v2.0/authorize')
    expect(u.searchParams.get('login_hint')).toBe('alice@acme.com')
    expect(u.searchParams.get('client_id')).toBe('cid')
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toMatch(/seta_sso_state=/)
    expect(setCookie).toMatch(/HttpOnly/i)
  })

  it('404s when the email has no workspace', async () => {
    const app = new Hono().onError(onError)
    app.route(
      '/',
      createSsoRoutes({
        sql,
        sessionCookie: { name: 'seta_sess', hmacKey: HMAC_KEY, ttlSec: 3600, secure: false },
        redirectBase: 'http://localhost:8080',
        meContext: { resolve: async () => ({ tenant: null, isSuperadmin: false, apps: [] }) },
        tenancy: { findOrAttachUser: async () => 'attached' },
        getClientSecret: async () => 'fake',
        getTenantBrief: async () => ({ slug, displayName: 'Acme' }),
        autoJoinOnDomain: async () => {},
      }),
    )
    const res = await app.request('/sso/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'alice@unknown.example' }),
    })
    expect(res.status).toBe(404)
  })
})
