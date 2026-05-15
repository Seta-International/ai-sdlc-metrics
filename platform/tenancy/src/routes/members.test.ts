import { OpenAPIHono } from '@hono/zod-openapi'
import { onError } from '@seta/middleware'
import type { MiddlewareHandler } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { tenantContext } from '../context'
import { createMembersRoutes } from './members'

const makeApp = (override: Partial<Parameters<typeof createMembersRoutes>[0]> = {}) => {
  const reqSession: MiddlewareHandler = async (c, next) => {
    c.set('userId', 'u1')
    c.set('sessionId', 's1')
    await next()
  }
  const app = new OpenAPIHono().onError(onError)
  const members = createMembersRoutes({
    sql: {} as never,
    requireSession: reqSession,
    membershipLookup: async () => ({ role: 'admin' }),
    invalidateUserSessions: async () => {},
    ...override,
  })
  app.route('/', members)
  return app
}

const runIn = <T>(tenantId: string, fn: () => Promise<T>) =>
  tenantContext.run({ tenantId, userId: 'u1' }, fn)

describe('GET /members', () => {
  it('403 for non-admin member', async () => {
    const app = makeApp({ membershipLookup: async () => ({ role: 'member' }) })
    const res = await runIn('t1', () => Promise.resolve(app.request('/members')))
    expect(res.status).toBe(403)
  })

  it('200 returns members list for admin', async () => {
    const sql: never = (() => Promise.resolve([])) as never
    const app = makeApp({ sql })
    const res = await runIn('t1', () => Promise.resolve(app.request('/members')))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { members: unknown[] }
    expect(Array.isArray(body.members)).toBe(true)
  })
})

describe('PATCH /members/:userId', () => {
  it('invokes setMemberRole + invalidateUserSessions', async () => {
    const invalidate = vi.fn(async () => {})
    const sql: never = ((strings: TemplateStringsArray) => {
      const s = strings.join('')
      if (s.includes('UPDATE')) return Promise.resolve([{ userId: 'target', role: 'admin' }])
      return Promise.resolve([])
    }) as never
    const app = makeApp({ sql, invalidateUserSessions: invalidate })
    const res = await runIn('t1', () =>
      Promise.resolve(
        app.request('/members/target', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ role: 'admin' }),
        }),
      ),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { member: { userId: string; role: string } }
    expect(body.member).toEqual({ userId: 'target', role: 'admin' })
    expect(invalidate).toHaveBeenCalledWith('target')
  })
})

describe('DELETE /members/:userId', () => {
  it('invokes removeMember + invalidateUserSessions', async () => {
    const invalidate = vi.fn(async () => {})
    const sql: never = (() => Promise.resolve([])) as never
    const app = makeApp({ sql, invalidateUserSessions: invalidate })
    const res = await runIn('t1', () =>
      Promise.resolve(app.request('/members/target', { method: 'DELETE' })),
    )
    expect(res.status).toBe(200)
    expect(invalidate).toHaveBeenCalledWith('target')
  })
})
