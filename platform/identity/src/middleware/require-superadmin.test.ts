import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import type { SsoVariables } from '../middleware'
import { requireSuperadmin } from './require-superadmin'

describe('requireSuperadmin', () => {
  it('403 when user is not in auth.superadmins', async () => {
    const app = new Hono<{ Variables: SsoVariables }>()
    // Simulate requireSession having already set userId on context
    app.use('*', async (c, next) => {
      c.set('userId', 'u1')
      c.set('sessionId', 's1')
      await next()
    })
    app.use('/admin/*', requireSuperadmin({ lookup: async () => false }))
    app.get('/admin/x', (c) => c.text('ok'))

    const res = await app.request('/admin/x')
    expect(res.status).toBe(403)
  })

  it('200 when user is a superadmin', async () => {
    const app = new Hono<{ Variables: SsoVariables }>()
    app.use('*', async (c, next) => {
      c.set('userId', 'u1')
      c.set('sessionId', 's1')
      await next()
    })
    app.use('/admin/*', requireSuperadmin({ lookup: async () => true }))
    app.get('/admin/x', (c) => c.text('ok'))

    const res = await app.request('/admin/x')
    expect(res.status).toBe(200)
  })

  it('403 when userId is missing (not authenticated)', async () => {
    const app = new Hono<{ Variables: SsoVariables }>()
    app.use('/admin/*', requireSuperadmin({ lookup: async () => true }))
    app.get('/admin/x', (c) => c.text('ok'))

    const res = await app.request('/admin/x')
    expect(res.status).toBe(403)
  })
})
