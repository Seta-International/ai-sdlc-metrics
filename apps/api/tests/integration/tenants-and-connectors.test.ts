import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/main'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'

describe('tenants + connector admin slice', () => {
  const sql = postgres(DATABASE_URL, { max: 1, prepare: false })
  const userId = '88888888-8888-8888-8888-888888888888'
  const tenantA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  const tenantB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

  beforeEach(async () => {
    await sql`TRUNCATE tenant.tenant_members, tenant.tenant_connectors CASCADE`
    await sql`TRUNCATE tenant.tenants CASCADE`
    await sql`
      INSERT INTO tenant.tenants (id, slug, display_name)
      VALUES (${tenantA}, 'acme', 'Acme'), (${tenantB}, 'globex', 'Globex')
    `
    await sql`
      INSERT INTO tenant.tenant_members (user_id, tenant_id, role)
      VALUES (${userId}, ${tenantA}, 'admin'), (${userId}, ${tenantB}, 'member')
    `
  })

  afterAll(async () => {
    await sql.end()
  })

  it('GET /tenants/:id/connectors lists registered connectors with consent status', async () => {
    const app = buildApp()
    const res = await app.request(`/tenants/${tenantA}/connectors`, {
      headers: { 'x-session-user': userId },
    })
    expect(res.status).toBe(200)
    const rows = (await res.json()) as Array<{ id: string; providerId: string; status: string }>
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(['consented', 'pending', 'failed', 'token-expired']).toContain(r.status)
    }
    expect(rows.map((r) => r.id)).toEqual(expect.arrayContaining(['ms365-planner']))
  })

  it('GET /tenants/:id/connectors returns 403 for a non-member', async () => {
    const app = buildApp()
    const res = await app.request(`/tenants/${tenantA}/connectors`, {
      headers: { 'x-session-user': '99999999-9999-9999-9999-999999999999' },
    })
    expect(res.status).toBe(403)
  })

  it('POST /tenants/:id/connectors/ms365-planner/consent-url returns an entra admin-consent URL', async () => {
    const app = buildApp()
    const res = await app.request(`/tenants/${tenantA}/connectors/ms365-planner/consent-url`, {
      method: 'POST',
      headers: { 'x-session-user': userId, 'content-type': 'application/json' },
      body: '{}',
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { url: string; state: string }
    expect(body.state).toBeTruthy()
    const parsed = new URL(body.url)
    expect(parsed.hostname).toBe('login.microsoftonline.com')
    expect(parsed.searchParams.get('state')).toBe(body.state)
  })
})
