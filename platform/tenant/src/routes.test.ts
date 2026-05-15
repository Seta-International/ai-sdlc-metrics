import { onError } from '@seta/middleware'
import { describe, expect, it } from 'vitest'
import { createTenantRoutes } from './routes'

describe('createTenantRoutes', () => {
  it('GET /tenants returns the membership rows for the session user', async () => {
    const app = createTenantRoutes({
      listTenants: async ({ userId }) =>
        userId === 'u1' ? [{ id: 't1', name: 'Acme', role: 'admin' }] : [],
      sessionUser: (c) => c.req.header('x-session-user'),
    })
    app.onError(onError)
    const res = await app.request('/tenants', { headers: { 'x-session-user': 'u1' } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([{ id: 't1', name: 'Acme', role: 'admin' }])
  })

  it('401 without session', async () => {
    const app = createTenantRoutes({
      listTenants: async () => [],
      sessionUser: () => undefined,
    })
    app.onError(onError)
    const res = await app.request('/tenants')
    expect(res.status).toBe(401)
  })
})
