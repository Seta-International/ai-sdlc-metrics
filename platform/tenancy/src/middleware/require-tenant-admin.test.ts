import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { requireTenantAdmin } from './require-tenant-admin'

type TestVariables = { userId: string; sessionId: string }

function build(lookup: (userId: string) => Promise<{ role: 'owner' | 'admin' | 'member' } | null>) {
  const app = new Hono<{ Variables: TestVariables }>()
  app.use('*', async (c, next) => {
    c.set('userId', 'u1')
    c.set('sessionId', 's1')
    await next()
  })
  app.use('/members/*', requireTenantAdmin({ lookup }))
  app.get('/members', (c) => c.text('ok'))
  return app
}

describe('requireTenantAdmin', () => {
  it('403 for member role', async () => {
    const app = build(async () => ({ role: 'member' }))
    const res = await app.request('/members')
    expect(res.status).toBe(403)
  })

  it('200 for admin role', async () => {
    const app = build(async () => ({ role: 'admin' }))
    const res = await app.request('/members')
    expect(res.status).toBe(200)
  })

  it('200 for owner role', async () => {
    const app = build(async () => ({ role: 'owner' }))
    const res = await app.request('/members')
    expect(res.status).toBe(200)
  })

  it('403 when lookup returns null (no membership)', async () => {
    const app = build(async () => null)
    const res = await app.request('/members')
    expect(res.status).toBe(403)
  })

  it('403 when userId is missing', async () => {
    const app = new Hono()
    app.use('/members/*', requireTenantAdmin({ lookup: async () => ({ role: 'admin' }) }))
    app.get('/members', (c) => c.text('ok'))
    const res = await app.request('/members')
    expect(res.status).toBe(403)
  })
})
