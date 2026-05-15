import { onError } from '@seta/middleware'
import { Hono } from 'hono'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { requireTenantMembership } from '../../src/membership'

const url = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'
const sql = postgres(url, { onnotice: () => {} })

afterAll(async () => {
  await sql.end()
})

beforeEach(async () => {
  await sql`TRUNCATE tenant.tenant_members CASCADE`
  await sql`TRUNCATE tenant.tenants CASCADE`
})

function buildApp() {
  return new Hono()
    .onError(onError)
    .use(
      '/tenants/:id/*',
      requireTenantMembership({
        lookup: async ({ userId, tenantId }) => {
          const rows = (await sql`
            SELECT role FROM tenant.tenant_members
            WHERE user_id = ${userId} AND tenant_id = ${tenantId}
            LIMIT 1
          `) as Array<{ role: 'owner' | 'admin' | 'member' }>
          return rows[0] ?? null
        },
      }),
    )
    .get('/tenants/:id/things', (c) => c.json({ ok: true, role: c.get('membership').role }))
}

describe('requireTenantMembership (integration)', () => {
  it('200 when the seeded user is a member', async () => {
    const userId = '33333333-3333-3333-3333-333333333333'
    const tenantId = '44444444-4444-4444-4444-444444444444'
    await sql`INSERT INTO tenant.tenants (id, slug, display_name) VALUES (${tenantId}, 'acme', 'Acme')`
    await sql`INSERT INTO tenant.tenant_members (user_id, tenant_id, role) VALUES (${userId}, ${tenantId}, 'admin')`

    const app = buildApp()
    const res = await app.request(`/tenants/${tenantId}/things`, {
      headers: { 'x-session-user': userId },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, role: 'admin' })
  })

  it('403 when the user has no membership for the tenant', async () => {
    const tenantId = '55555555-5555-5555-5555-555555555555'
    await sql`INSERT INTO tenant.tenants (id, slug, display_name) VALUES (${tenantId}, 'globex', 'Globex')`

    const app = buildApp()
    const res = await app.request(`/tenants/${tenantId}/things`, {
      headers: { 'x-session-user': '66666666-6666-6666-6666-666666666666' },
    })
    expect(res.status).toBe(403)
  })

  it('401 when no session user header is present', async () => {
    const tenantId = '77777777-7777-7777-7777-777777777777'
    await sql`INSERT INTO tenant.tenants (id, slug, display_name) VALUES (${tenantId}, 'umbrella', 'Umbrella')`

    const app = buildApp()
    const res = await app.request(`/tenants/${tenantId}/things`)
    expect(res.status).toBe(401)
  })
})
