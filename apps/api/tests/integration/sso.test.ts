import { upsertSsoConfig, upsertSsoEmailDomain } from '@seta/identity'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/main'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'
const tenantId = '00000000-0000-4000-8000-0000000000b1'
const slug = 'sso-smoke-tenant'

describe('GET /me without session', () => {
  it('returns 401 with RFC 7807 problem JSON', async () => {
    const app = buildApp()
    const res = await app.request('/me')
    expect(res.status).toBe(401)
    expect(res.headers.get('content-type')).toMatch(/application\/problem\+json/)
    const body = (await res.json()) as { type: string; title: string; status: number }
    expect(body).toMatchObject({
      type: expect.any(String),
      title: expect.any(String),
      status: 401,
    })
  })
})

describe('apps/api SSO smoke', () => {
  const sql = postgres(DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} })

  beforeEach(async () => {
    await sql`DELETE FROM auth.sso_email_domains WHERE tenant_id = ${tenantId} OR domain = 'smoke.test'`
    await sql`DELETE FROM auth.sso_configs WHERE tenant_id = ${tenantId}`
    await sql`DELETE FROM tenant.tenants WHERE id = ${tenantId} OR slug = ${slug}`
    await sql`INSERT INTO tenant.tenants (id, slug, display_name) VALUES (${tenantId}, ${slug}, 'Smoke')`
    await upsertSsoConfig(sql, {
      tenantId,
      provider: 'entra',
      config: { entra_tenant_id: 'tid-smoke', client_id: 'cid' },
      secretVaultId: 'sso-entra:sso',
      createdByUserId: null,
    })
    await upsertSsoEmailDomain(sql, { domain: 'smoke.test', tenantId })
  })
  afterAll(async () => {
    await sql.end()
  })

  it('POST /sso/discover hits a real workspace', async () => {
    const app = buildApp()
    const res = await app.request('/sso/discover', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@smoke.test' }),
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as Record<string, unknown>
    expect(json).toMatchObject({ ok: true, provider: 'entra', tenantSlug: slug })
  })
})
