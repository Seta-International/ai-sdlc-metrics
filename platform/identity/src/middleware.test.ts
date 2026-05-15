import { onError, Unauthorized } from '@seta/middleware'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { csrfMiddleware, requireSession, type SsoVariables } from './middleware'
import type { Session } from './schema'

const HMAC_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const COOKIE_NAME = 'seta_sess'

type FakeStore = { get(id: string): Promise<Session | null> }

function makeApp(store: FakeStore) {
  const app = new Hono<{ Variables: SsoVariables }>().onError(onError)
  app.use(
    '*',
    requireSession({
      cookieName: COOKIE_NAME,
      hmacKey: HMAC_KEY,
      sessionStore: store,
    }),
  )
  app.get('/protected', (c) => c.json({ userId: c.get('userId'), sessionId: c.get('sessionId') }))
  return app
}

describe('requireSession', () => {
  it('returns 401 when no cookie is sent', async () => {
    const app = makeApp({ get: async () => null })
    const res = await app.request('/protected')
    expect(res.status).toBe(401)
  })

  it('returns 401 when cookie HMAC is invalid', async () => {
    const app = makeApp({ get: async () => null })
    const res = await app.request('/protected', {
      headers: { cookie: `${COOKIE_NAME}=tampered.signature` },
    })
    expect(res.status).toBe(401)
  })

  it('returns 401 when session row does not exist', async () => {
    const { signCookie } = await import('./cookie')
    const cookie = signCookie('11111111-1111-1111-1111-111111111111', HMAC_KEY)
    const app = makeApp({ get: async () => null })
    const res = await app.request('/protected', {
      headers: { cookie: `${COOKIE_NAME}=${cookie}` },
    })
    expect(res.status).toBe(401)
  })

  it('returns 401 when session has expired', async () => {
    const { signCookie } = await import('./cookie')
    const sessionId = '11111111-1111-1111-1111-111111111111'
    const cookie = signCookie(sessionId, HMAC_KEY)
    const app = makeApp({
      get: async () => ({
        id: sessionId,
        userId: '22222222-2222-2222-2222-222222222222',
        expiresAt: new Date(Date.now() - 1000),
        ip: null,
        userAgent: null,
        lastSeenAt: new Date(),
        createdAt: new Date(),
      }),
    })
    const res = await app.request('/protected', {
      headers: { cookie: `${COOKIE_NAME}=${cookie}` },
    })
    expect(res.status).toBe(401)
  })

  it('attaches userId and sessionId to context when cookie + session row are valid', async () => {
    const { signCookie } = await import('./cookie')
    const sessionId = '11111111-1111-1111-1111-111111111111'
    const userId = '22222222-2222-2222-2222-222222222222'
    const cookie = signCookie(sessionId, HMAC_KEY)
    const app = makeApp({
      get: async (id) => {
        if (id !== sessionId) return null
        return {
          id: sessionId,
          userId,
          expiresAt: new Date(Date.now() + 60_000),
          ip: null,
          userAgent: null,
          lastSeenAt: new Date(),
          createdAt: new Date(),
        }
      },
    })
    const res = await app.request('/protected', {
      headers: { cookie: `${COOKIE_NAME}=${cookie}` },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ userId, sessionId })
  })
})

describe('csrfMiddleware', () => {
  it('passes when X-CSRF-Token matches the session-derived token', async () => {
    const { deriveCsrfToken } = await import('./csrf')
    const sessionId = 'abc'
    const app = new Hono<{ Variables: SsoVariables }>().onError(onError)
    app.use('*', async (c, next) => {
      c.set('sessionId', sessionId)
      c.set('userId', 'user-1')
      await next()
    })
    app.use('*', csrfMiddleware({ hmacKey: HMAC_KEY }))
    app.post('/x', (c) => c.json({ ok: true }))
    const res = await app.request('/x', {
      method: 'POST',
      headers: { 'x-csrf-token': deriveCsrfToken(sessionId, HMAC_KEY) },
    })
    expect(res.status).toBe(200)
  })

  it('returns 401 when X-CSRF-Token is missing', async () => {
    const sessionId = 'abc'
    const app = new Hono<{ Variables: SsoVariables }>().onError(onError)
    app.use('*', async (c, next) => {
      c.set('sessionId', sessionId)
      c.set('userId', 'user-1')
      await next()
    })
    app.use('*', csrfMiddleware({ hmacKey: HMAC_KEY }))
    app.post('/x', (c) => c.json({ ok: true }))
    const res = await app.request('/x', { method: 'POST' })
    expect(res.status).toBe(401)
  })

  it('returns 401 when X-CSRF-Token does not match', async () => {
    const sessionId = 'abc'
    const app = new Hono<{ Variables: SsoVariables }>().onError(onError)
    app.use('*', async (c, next) => {
      c.set('sessionId', sessionId)
      c.set('userId', 'user-1')
      await next()
    })
    app.use('*', csrfMiddleware({ hmacKey: HMAC_KEY }))
    app.post('/x', (c) => c.json({ ok: true }))
    const res = await app.request('/x', {
      method: 'POST',
      headers: { 'x-csrf-token': 'wrong-token' },
    })
    expect(res.status).toBe(401)
  })

  it('returns 401 when no session has been attached to context', async () => {
    const app = new Hono<{ Variables: SsoVariables }>().onError(onError)
    app.use('*', csrfMiddleware({ hmacKey: HMAC_KEY }))
    app.post('/x', (c) => c.json({ ok: true }))
    const res = await app.request('/x', {
      method: 'POST',
      headers: { 'x-csrf-token': 'any' },
    })
    expect(res.status).toBe(401)
  })
})

void Unauthorized
