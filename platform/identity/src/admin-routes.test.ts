import { onError } from '@seta/middleware'
import { Hono } from 'hono'
import type { Sql } from 'postgres'
import { describe, expect, it, vi } from 'vitest'
import { createSsoAdminRoutes } from './admin-routes'
import type { SsoVariables } from './middleware'

function noopSql(): Sql {
  return (async () => []) as unknown as Sql
}

function makeApp(overrides: Partial<Parameters<typeof createSsoAdminRoutes>[0]> = {}) {
  const app = new Hono<{ Variables: SsoVariables }>().onError(onError)
  app.use('*', async (c, next) => {
    c.set('userId', 'superadmin-1')
    c.set('sessionId', 'sess')
    await next()
  })
  app.route(
    '/',
    createSsoAdminRoutes({
      sql: noopSql(),
      audit: { recordAudit: vi.fn(async () => {}) },
      vault: {
        put: vi.fn(async () => {}),
        get: vi.fn(async () => ({ accessToken: 'x' })),
        delete: vi.fn(async () => {}),
      },
      ...overrides,
    }),
  )
  return app
}

describe('admin-routes (unit)', () => {
  it('rejects upsert with a denylist domain', async () => {
    const app = makeApp()
    const res = await app.request('/admin/sso/tenants/00000000-0000-4000-8000-000000000001', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'entra',
        config: { entra_tenant_id: 'tid', client_id: 'cid' },
        domains: ['gmail.com'],
        clientSecret: 'sec',
      }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects upsert with invalid body (missing config.client_id)', async () => {
    const app = makeApp()
    const res = await app.request('/admin/sso/tenants/00000000-0000-4000-8000-000000000001', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'entra',
        config: { entra_tenant_id: 'tid' },
      }),
    })
    expect([400, 422]).toContain(res.status)
  })

  it('rotate-secret 404s when no config exists', async () => {
    const app = makeApp({ sql: noopSql() })
    const res = await app.request(
      '/admin/sso/tenants/00000000-0000-4000-8000-000000000001/rotate-secret',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientSecret: 'new' }),
      },
    )
    expect(res.status).toBe(404)
  })
})
