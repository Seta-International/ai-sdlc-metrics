import { OpenAPIHono } from '@hono/zod-openapi'
import { onError } from '@seta/middleware'
import type { MiddlewareHandler } from 'hono'
import { describe, expect, it } from 'vitest'
import { createAdminRoutes } from './admin'

const makeApp = (override: Partial<Parameters<typeof createAdminRoutes>[0]> = {}) => {
  const reqSession: MiddlewareHandler = async (c, next) => {
    c.set('userId', 'u1')
    c.set('sessionId', 's1')
    await next()
  }
  const app = new OpenAPIHono().onError(onError)
  const admin = createAdminRoutes({
    sql: (() => Promise.resolve([])) as never,
    requireSession: reqSession,
    isSuperadmin: async () => true,
    ...override,
  })
  app.route('/', admin)
  return app
}

describe('GET /admin/tenants', () => {
  it('200 for superadmin', async () => {
    const app = makeApp()
    const res = await app.request('/admin/tenants')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { tenants: unknown[] }
    expect(Array.isArray(body.tenants)).toBe(true)
  })

  it('403 for non-superadmin', async () => {
    const app = makeApp({ isSuperadmin: async () => false })
    const res = await app.request('/admin/tenants')
    expect(res.status).toBe(403)
  })
})
