import { createSsoRoutes, type SsoProvider } from '@seta/identity'
import { onError } from '@seta/middleware'
import { Hono } from 'hono'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/main'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'
const HMAC_KEY = 'a'.repeat(32)

describe('GET /me without session', () => {
  it('returns 401 with RFC 7807 problem JSON', async () => {
    const app = buildApp()
    const res = await app.request('/me')
    expect(res.status).toBe(401)
    expect(res.headers.get('content-type')).toMatch(/application\/problem\+json/)
    const body = (await res.json()) as { type: string; title: string; status: number }
    expect(body).toMatchObject({
      type: expect.any(String),
      title: expect.any(String),
      status: 401,
    })
  })
})

const mockProvider = (id: 'entra' | 'google'): SsoProvider => ({
  id,
  authorizeUrl: ({ state, redirectUri }) =>
    `https://mock.${id}/authorize?state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`,
  exchangeCode: async () => ({
    sub: `mock-${id}-subject`,
    email: 'user@example.com',
    name: 'Mock User',
    iss: `https://mock.${id}`,
    aud: `${id}-client`,
  }),
})

function buildSsoApp(sql: postgres.Sql) {
  const app = new Hono().onError(onError)
  const sso = createSsoRoutes({
    providers: { entra: mockProvider('entra'), google: mockProvider('google') },
    enabledProviders: ['entra', 'google'],
    sql,
    sessionCookie: {
      name: 'seta_sess',
      hmacKey: HMAC_KEY,
      ttlSec: 86400,
      secure: false,
    },
    redirectBase: 'http://localhost:8080',
    meContext: {
      resolve: async () => ({ tenant: null, isSuperadmin: false, apps: [] }),
    },
    tenancy: {
      findOrAttachUser: async () => 'attached',
    },
  })
  app.route('/', sso)
  return app
}

function buildSsoAppWithProviders(sql: postgres.Sql, enabledProviders: Array<'entra' | 'google'>) {
  const app = new Hono().onError(onError)
  const sso = createSsoRoutes({
    providers: { entra: mockProvider('entra'), google: mockProvider('google') },
    enabledProviders,
    sql,
    sessionCookie: {
      name: 'seta_sess',
      hmacKey: HMAC_KEY,
      ttlSec: 86400,
      secure: false,
    },
    redirectBase: 'http://localhost:8080',
    meContext: {
      resolve: async () => ({ tenant: null, isSuperadmin: false, apps: [] }),
    },
    tenancy: {
      findOrAttachUser: async () => 'attached',
    },
  })
  app.route('/', sso)
  return app
}

describe('SSO round-trip with mock provider', () => {
  const sql = postgres(DATABASE_URL, { max: 1, prepare: false })

  beforeEach(async () => {
    await sql`TRUNCATE auth.sessions, auth.user_identities, auth.users CASCADE`
  })

  afterAll(async () => {
    await sql.end()
  })

  it('login → callback → /me yields a session and user payload', async () => {
    const app = buildSsoApp(sql)

    const loginRes = await app.request('/sso/login/entra', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ returnTo: '/' }),
    })
    expect(loginRes.status).toBe(200)
    const { url } = (await loginRes.json()) as { url: string }
    const parsed = new URL(url)
    const state = parsed.searchParams.get('state')
    expect(state).toBeTruthy()
    const loginSetCookie = loginRes.headers.get('set-cookie')
    expect(loginSetCookie).toMatch(/seta_sso_state=/)

    const callbackRes = await app.request(`/sso/callback/entra?code=mock-code&state=${state}`, {
      headers: { cookie: loginSetCookie ?? '' },
    })
    expect(callbackRes.status).toBe(302)
    expect(callbackRes.headers.get('location')).toBe('/')
    const sessCookieHeader = callbackRes.headers.get('set-cookie') ?? ''
    expect(sessCookieHeader).toMatch(/seta_sess=/)
    const sessCookie = sessCookieHeader.split(',').find((c) => c.includes('seta_sess='))
    expect(sessCookie).toBeDefined()

    const rows = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count
      FROM auth.sessions
      WHERE user_id IN (
        SELECT user_id FROM auth.user_identities
        WHERE provider = 'entra' AND subject = 'mock-entra-subject'
      )
    `
    expect(Number(rows[0].count)).toBeGreaterThan(0)

    const meRes = await app.request('/me', { headers: { cookie: sessCookie ?? '' } })
    expect(meRes.status).toBe(200)
    const me = (await meRes.json()) as {
      user: { email: string; name: string }
      tenant: null | { id: string; slug: string; name: string; isAdmin: boolean }
      isSuperadmin: boolean
      apps: string[]
      csrfToken: string
    }
    expect(me.user.email).toBe('user@example.com')
    expect(me.tenant).toBeNull()
    expect(me.isSuperadmin).toBe(false)
    expect(me.apps).toEqual([])
    expect(typeof me.csrfToken).toBe('string')
    expect(me.csrfToken.length).toBeGreaterThan(0)
  })
})

describe('SSO provider gating', () => {
  const sql = postgres(DATABASE_URL, { max: 1, prepare: false })

  afterAll(async () => {
    await sql.end()
  })

  it('GET /sso/providers returns the enabled list', async () => {
    const app = buildSsoAppWithProviders(sql, ['entra'])
    const res = await app.request('/sso/providers')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { providers: string[] }
    expect(body.providers).toEqual(['entra'])
  })

  it('POST /sso/login/<disabled> returns 404', async () => {
    const app = buildSsoAppWithProviders(sql, ['entra'])
    const res = await app.request('/sso/login/google', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(404)
  })

  it('POST /sso/login/<enabled> still succeeds', async () => {
    const app = buildSsoAppWithProviders(sql, ['entra'])
    const res = await app.request('/sso/login/entra', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(200)
  })
})
