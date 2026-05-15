import { onError } from '@seta/middleware'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { requireTenantMembership } from './membership'

describe('requireTenantMembership', () => {
  it('403 when user has no membership row for the route tenant', async () => {
    const app = new Hono()
      .onError(onError)
      .use('/tenants/:id/*', requireTenantMembership({ lookup: async () => null }))
      .get('/tenants/:id/x', (c) => c.json({ ok: true }))
    const res = await app.request('/tenants/t1/x', {
      headers: { 'x-session-user': 'u1' },
    })
    expect(res.status).toBe(403)
  })

  it('continues when lookup returns a member row', async () => {
    const app = new Hono()
      .onError(onError)
      .use('/tenants/:id/*', requireTenantMembership({ lookup: async () => ({ role: 'admin' }) }))
      .get('/tenants/:id/x', (c) => c.json({ ok: true, role: c.get('membership').role }))
    const res = await app.request('/tenants/t1/x', {
      headers: { 'x-session-user': 'u1' },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, role: 'admin' })
  })

  it('401 if no session user on context', async () => {
    const app = new Hono()
      .onError(onError)
      .use(
        '*',
        requireTenantMembership({
          lookup: async () => ({ role: 'admin' }),
          sessionUser: () => undefined,
        }),
      )
      .get('/tenants/:id/x', (c) => c.json({ ok: true }))
    const res = await app.request('/tenants/t1/x')
    expect(res.status).toBe(401)
  })
})
