import { OpenAPIHono } from '@hono/zod-openapi'
import type { AuditWriter } from '@seta/audit'
import { onError } from '@seta/middleware'
import type { MiddlewareHandler } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { tenantContext } from '../context'
import { createMembersRoutes } from './members'

const makeAuditStub = (): AuditWriter & { calls: unknown[] } => {
  const calls: unknown[] = []
  return {
    calls,
    async recordAudit(e) {
      calls.push(e)
    },
  }
}

const makeApp = (override: Partial<Parameters<typeof createMembersRoutes>[0]> = {}) => {
  const reqSession: MiddlewareHandler = async (c, next) => {
    c.set('userId', 'u1')
    c.set('sessionId', 's1')
    await next()
  }
  const audit = makeAuditStub()
  const app = new OpenAPIHono().onError(onError)
  const members = createMembersRoutes({
    sql: {} as never,
    requireSession: reqSession,
    membershipLookup: async () => ({ role: 'admin' }),
    invalidateUserSessions: async () => {},
    audit,
    ...override,
  })
  app.route('/', members)
  return { app, audit }
}

const runIn = <T>(tenantId: string, fn: () => Promise<T>) =>
  tenantContext.run({ tenantId, userId: 'u1' }, fn)

describe('GET /members', () => {
  it('403 for non-admin member', async () => {
    const { app } = makeApp({ membershipLookup: async () => ({ role: 'member' }) })
    const res = await runIn('t1', () => Promise.resolve(app.request('/members')))
    expect(res.status).toBe(403)
  })

  it('200 returns members list for admin', async () => {
    const sql: never = (() => Promise.resolve([])) as never
    const { app } = makeApp({ sql })
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
    const { app } = makeApp({ sql, invalidateUserSessions: invalidate })
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

  it('records audit event with from/to roles', async () => {
    const sql: never = ((strings: TemplateStringsArray) => {
      const s = strings.join('')
      if (s.includes('SELECT role FROM tenant.tenant_members'))
        return Promise.resolve([{ role: 'member' }])
      if (s.includes('UPDATE')) return Promise.resolve([{ userId: 'target', role: 'admin' }])
      return Promise.resolve([])
    }) as never
    const { app, audit } = makeApp({ sql })
    await runIn('t1', () =>
      Promise.resolve(
        app.request('/members/target', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ role: 'admin' }),
        }),
      ),
    )
    expect(audit.calls).toHaveLength(1)
    expect(audit.calls[0]).toMatchObject({
      tenantId: 't1',
      actor: { type: 'user', userId: 'u1' },
      operation: 'tenancy.role_changed',
      metadata: { from: 'member', to: 'admin' },
    })
  })
})

describe('DELETE /members/:userId', () => {
  it('invokes removeMember + invalidateUserSessions', async () => {
    const invalidate = vi.fn(async () => {})
    const sql: never = (() => Promise.resolve([])) as never
    const { app } = makeApp({ sql, invalidateUserSessions: invalidate })
    const res = await runIn('t1', () =>
      Promise.resolve(app.request('/members/target', { method: 'DELETE' })),
    )
    expect(res.status).toBe(200)
    expect(invalidate).toHaveBeenCalledWith('target')
  })

  it('records audit event', async () => {
    const sql: never = (() => Promise.resolve([])) as never
    const { app, audit } = makeApp({ sql })
    await runIn('t1', () => Promise.resolve(app.request('/members/target', { method: 'DELETE' })))
    expect(audit.calls).toHaveLength(1)
    expect(audit.calls[0]).toMatchObject({
      operation: 'tenancy.member_removed',
      resource: { type: 'tenant_member', ids: ['target'] },
    })
  })
})
