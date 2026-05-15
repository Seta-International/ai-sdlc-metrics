import { onError } from '@seta/middleware'
import { Hono } from 'hono'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createSsoRoutes } from '../../src/routes'
import { MockSsoProvider } from './_mock-provider'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'
const HMAC_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

const entraFixture = {
  sub: 'entra-sub-1',
  email: 'alice@example.com',
  name: 'Alice',
  picture: 'https://cdn.example/alice.png',
  iss: 'https://login.microsoftonline.com/common/v2.0',
  aud: 'entra-client',
}

function buildApp(sql: postgres.Sql) {
  const app = new Hono().onError(onError)
  const sso = createSsoRoutes({
    providers: {
      entra: new MockSsoProvider('entra', entraFixture),
      google: new MockSsoProvider('google', {
        ...entraFixture,
        sub: 'google-sub-1',
        iss: 'https://accounts.google.com',
      }),
    },
    sql,
    sessionCookie: { name: 'seta_sess', hmacKey: HMAC_KEY, ttlSec: 3600, secure: false },
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

describe('createSsoRoutes (integration)', () => {
  const sql = postgres(DATABASE_URL, { max: 1, prepare: false })

  beforeEach(async () => {
    await sql`TRUNCATE auth.sessions, auth.user_identities, auth.users CASCADE`
  })

  afterAll(async () => {
    await sql.end()
  })

  it('POST /sso/login/entra returns an authorize URL and sets a state cookie', async () => {
    const app = buildApp(sql)
    const res = await app.request('/sso/login/entra', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ returnTo: '/dashboard' }),
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as { url: string }
    expect(json.url).toMatch(/^https:\/\/mock-entra\.test\/authorize/)
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toMatch(/seta_sso_state=/)
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/SameSite=Lax/i)
  })

  it('GET /sso/callback/entra exchanges code, upserts user, creates session, sets cookie, 302s', async () => {
    const app = buildApp(sql)
    const start = await app.request('/sso/login/entra', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ returnTo: '/dashboard' }),
    })
    const stateCookieRaw = (start.headers.get('set-cookie') ?? '').match(
      /seta_sso_state=([^;]+)/,
    )?.[1]
    expect(stateCookieRaw).toBeDefined()
    const startUrl = new URL(((await start.json()) as { url: string }).url)
    const state = startUrl.searchParams.get('state') ?? ''

    const cbRes = await app.request(`/sso/callback/entra?code=fake-code&state=${state}`, {
      headers: { cookie: `seta_sso_state=${stateCookieRaw}` },
    })
    expect(cbRes.status).toBe(302)
    expect(cbRes.headers.get('location')).toBe('/dashboard')
    const cbCookie = cbRes.headers.get('set-cookie') ?? ''
    expect(cbCookie).toMatch(/seta_sess=/)

    const userRows = await sql<
      { count: string }[]
    >`SELECT count(*)::text FROM auth.users WHERE email = ${entraFixture.email}`
    expect(userRows[0]?.count).toBe('1')
    const idRows = await sql<
      { count: string }[]
    >`SELECT count(*)::text FROM auth.user_identities WHERE provider = 'entra' AND subject = ${entraFixture.sub}`
    expect(idRows[0]?.count).toBe('1')
    const sessRows = await sql<{ count: string }[]>`SELECT count(*)::text FROM auth.sessions`
    expect(sessRows[0]?.count).toBe('1')
  })

  it('GET /me without cookie returns 401', async () => {
    const app = buildApp(sql)
    const res = await app.request('/me')
    expect(res.status).toBe(401)
  })

  it('GET /me with valid cookie returns user + tenant context + csrfToken', async () => {
    const app = buildApp(sql)
    const start = await app.request('/sso/login/entra', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    const stateCookieRaw =
      (start.headers.get('set-cookie') ?? '').match(/seta_sso_state=([^;]+)/)?.[1] ?? ''
    const state =
      new URL(((await start.json()) as { url: string }).url).searchParams.get('state') ?? ''
    const cb = await app.request(`/sso/callback/entra?code=c&state=${state}`, {
      headers: { cookie: `seta_sso_state=${stateCookieRaw}` },
    })
    const sessCookieRaw = (cb.headers.get('set-cookie') ?? '').match(/seta_sess=([^;]+)/)?.[1] ?? ''

    const meRes = await app.request('/me', { headers: { cookie: `seta_sess=${sessCookieRaw}` } })
    expect(meRes.status).toBe(200)
    const me = (await meRes.json()) as {
      user: { email: string; name: string }
      tenant: null | { id: string; slug: string; name: string; isAdmin: boolean }
      isSuperadmin: boolean
      apps: string[]
      csrfToken: string
    }
    expect(me.user.email).toBe(entraFixture.email)
    expect(me.user.name).toBe(entraFixture.name)
    expect(me.tenant).toBeNull()
    expect(me.isSuperadmin).toBe(false)
    expect(me.apps).toEqual([])
    expect(typeof me.csrfToken).toBe('string')
    expect(me.csrfToken.length).toBeGreaterThan(0)
  })

  it('POST /sso/logout deletes session row and /me subsequently returns 401', async () => {
    const app = buildApp(sql)
    const start = await app.request('/sso/login/entra', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    const stateCookieRaw =
      (start.headers.get('set-cookie') ?? '').match(/seta_sso_state=([^;]+)/)?.[1] ?? ''
    const state =
      new URL(((await start.json()) as { url: string }).url).searchParams.get('state') ?? ''
    const cb = await app.request(`/sso/callback/entra?code=c&state=${state}`, {
      headers: { cookie: `seta_sso_state=${stateCookieRaw}` },
    })
    const sessCookieRaw = (cb.headers.get('set-cookie') ?? '').match(/seta_sess=([^;]+)/)?.[1] ?? ''

    const logoutRes = await app.request('/sso/logout', {
      method: 'POST',
      headers: { cookie: `seta_sess=${sessCookieRaw}` },
    })
    expect(logoutRes.status).toBe(200)

    const sessRows = await sql<{ count: string }[]>`SELECT count(*)::text FROM auth.sessions`
    expect(sessRows[0]?.count).toBe('0')

    const meRes = await app.request('/me', { headers: { cookie: `seta_sess=${sessCookieRaw}` } })
    expect(meRes.status).toBe(401)
  })

  it('callback links a second provider to the same user when email matches', async () => {
    const app = buildApp(sql)

    const startA = await app.request('/sso/login/entra', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    const stateCookieA =
      (startA.headers.get('set-cookie') ?? '').match(/seta_sso_state=([^;]+)/)?.[1] ?? ''
    const stateA =
      new URL(((await startA.json()) as { url: string }).url).searchParams.get('state') ?? ''
    await app.request(`/sso/callback/entra?code=c&state=${stateA}`, {
      headers: { cookie: `seta_sso_state=${stateCookieA}` },
    })

    const startB = await app.request('/sso/login/google', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    const stateCookieB =
      (startB.headers.get('set-cookie') ?? '').match(/seta_sso_state=([^;]+)/)?.[1] ?? ''
    const stateB =
      new URL(((await startB.json()) as { url: string }).url).searchParams.get('state') ?? ''
    await app.request(`/sso/callback/google?code=c&state=${stateB}`, {
      headers: { cookie: `seta_sso_state=${stateCookieB}` },
    })

    const userCount = await sql<{ count: string }[]>`SELECT count(*)::text FROM auth.users`
    expect(userCount[0]?.count).toBe('1')
    const idCount = await sql<{ count: string }[]>`SELECT count(*)::text FROM auth.user_identities`
    expect(idCount[0]?.count).toBe('2')
  })
})
