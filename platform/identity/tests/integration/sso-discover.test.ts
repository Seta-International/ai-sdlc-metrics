import { onError } from '@seta/middleware'
import { Hono } from 'hono'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createSsoRoutes } from '../../src/routes'
import { upsertSsoConfig, upsertSsoEmailDomain } from '../../src/sso-config-repo'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'
const HMAC_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const tenantId = '00000000-0000-4000-8000-0000000000a1'
const slug = 'sso-disc-acme'

function buildApp(sql: postgres.Sql) {
  const app = new Hono().onError(onError)
  app.route(
    '/',
    createSsoRoutes({
      sql,
      sessionCookie: { name: 'seta_sess', hmacKey: HMAC_KEY, ttlSec: 3600, secure: false },
      redirectBase: 'http://localhost:8080',
      meContext: { resolve: async () => ({ tenant: null, isSuperadmin: false, apps: [] }) },
      tenancy: { findOrAttachUser: async () => 'attached' },
      getClientSecret: async () => 'unused-in-discover',
      getTenantBrief: async () => ({ slug, displayName: 'Acme Inc.' }),
      autoJoinOnDomain: async () => {},
    }),
  )
  return app
}

describe('POST /sso/discover (integration)', () => {
  const sql = postgres(DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} })

  beforeEach(async () => {
    await sql`DELETE FROM auth.sso_email_domains WHERE tenant_id = ${tenantId} OR domain = 'acme.com'`
    await sql`DELETE FROM auth.sso_configs WHERE tenant_id = ${tenantId}`
    await sql`DELETE FROM tenant.tenants WHERE id = ${tenantId} OR slug = ${slug}`
    await sql`INSERT INTO tenant.tenants (id, slug, display_name) VALUES (${tenantId}, ${slug}, 'Acme Inc.')`
    await upsertSsoConfig(sql, {
      tenantId,
      provider: 'entra',
      config: { entra_tenant_id: 'tid-acme', client_id: 'cid' },
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

  it('returns provider+slug+displayName for a configured domain', async () => {
    const app = buildApp(sql)
    const res = await app.request('/sso/discover', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'alice@ACME.com' }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toMatchObject({
      ok: true,
      provider: 'entra',
      tenantSlug: slug,
      displayName: 'Acme Inc.',
    })
  })

  it('returns no_workspace_for_email for an unknown domain', async () => {
    const app = buildApp(sql)
    const res = await app.request('/sso/discover', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'alice@nowhere.example' }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: false, error: 'no_workspace_for_email' })
  })
})
