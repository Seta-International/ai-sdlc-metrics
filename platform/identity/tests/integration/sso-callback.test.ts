import { onError } from '@seta/middleware'
import { Hono } from 'hono'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { signCookie } from '../../src/cookie'
import { createSsoRoutes } from '../../src/routes'
import { upsertSsoConfig, upsertSsoEmailDomain } from '../../src/sso-config-repo'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'
const HMAC_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const tenantId = '00000000-0000-4000-8000-0000000000a3'
const slug = 'sso-cb-acme'
const entraTenantId = '99999999-8888-7777-6666-555555555555'
const clientId = 'cid'

async function mintIdToken(args: {
  email: string
  sub: string
}): Promise<{ token: string; jwks: unknown }> {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true })
  const jwk = await exportJWK(publicKey)
  jwk.kid = 'kid-1'
  jwk.alg = 'RS256'
  jwk.use = 'sig'
  const token = await new SignJWT({ email: args.email, name: 'Alice', sub: args.sub })
    .setProtectedHeader({ alg: 'RS256', kid: 'kid-1' })
    .setIssuer(`https://login.microsoftonline.com/${entraTenantId}/v2.0`)
    .setAudience(clientId)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey)
  return { token, jwks: { keys: [jwk] } }
}

function buildFetchStub(idToken: string, jwks: unknown): typeof fetch {
  const fetchStub: typeof fetch = async (input) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    if (url.endsWith('/.well-known/openid-configuration')) {
      return new Response(
        JSON.stringify({
          issuer: `https://login.microsoftonline.com/${entraTenantId}/v2.0`,
          authorization_endpoint: `https://login.microsoftonline.com/${entraTenantId}/oauth2/v2.0/authorize`,
          token_endpoint: `https://login.microsoftonline.com/${entraTenantId}/oauth2/v2.0/token`,
          jwks_uri: 'https://stub.test/jwks.json',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    if (url === 'https://stub.test/jwks.json') {
      return new Response(JSON.stringify(jwks), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (url.endsWith('/oauth2/v2.0/token')) {
      return new Response(JSON.stringify({ id_token: idToken }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    throw new Error(`unexpected fetch ${url}`)
  }
  return fetchStub
}

describe('GET /sso/callback/entra (integration)', () => {
  const sql = postgres(DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} })

  beforeEach(async () => {
    await sql`DELETE FROM auth.sessions WHERE user_id IN (SELECT id FROM auth.users WHERE email IN ('alice@acme.com','bob@other.example'))`
    await sql`DELETE FROM auth.user_identities WHERE user_id IN (SELECT id FROM auth.users WHERE email IN ('alice@acme.com','bob@other.example'))`
    await sql`DELETE FROM auth.users WHERE email IN ('alice@acme.com','bob@other.example')`
    await sql`DELETE FROM auth.sso_email_domains WHERE tenant_id = ${tenantId} OR domain = 'acme.com'`
    await sql`DELETE FROM auth.sso_configs WHERE tenant_id = ${tenantId}`
    await sql`DELETE FROM tenant.tenant_members WHERE tenant_id = ${tenantId}`
    await sql`DELETE FROM tenant.tenants WHERE id = ${tenantId} OR slug = ${slug}`
    await sql`INSERT INTO tenant.tenants (id, slug, display_name) VALUES (${tenantId}, ${slug}, 'Acme')`
    await upsertSsoConfig(sql, {
      tenantId,
      provider: 'entra',
      config: { entra_tenant_id: entraTenantId, client_id: clientId },
      secretVaultId: 'sso-entra:sso',
      createdByUserId: null,
    })
    await upsertSsoEmailDomain(sql, { domain: 'acme.com', tenantId })
  })
  afterAll(async () => {
    await sql.end()
  })

  it('happy path: exchanges code, upserts user, auto-joins, sets session + last-login cookies', async () => {
    const { token, jwks } = await mintIdToken({ email: 'alice@acme.com', sub: 'sub-1' })
    let autoJoined = false

    const app = new Hono().onError(onError)
    app.route(
      '/',
      createSsoRoutes({
        sql,
        sessionCookie: { name: 'seta_sess', hmacKey: HMAC_KEY, ttlSec: 3600, secure: false },
        redirectBase: 'http://localhost:8080',
        meContext: { resolve: async () => ({ tenant: null, isSuperadmin: false, apps: [] }) },
        tenancy: { findOrAttachUser: async () => 'attached' },
        getClientSecret: async () => 'fake-secret',
        getTenantBrief: async () => ({ slug, displayName: 'Acme' }),
        autoJoinOnDomain: async () => {
          autoJoined = true
        },
      }),
    )
    const originalFetch = globalThis.fetch
    globalThis.fetch = buildFetchStub(token, jwks)
    try {
      const state = 'state-1'
      const statePayload = {
        pkce: 'verifier',
        returnTo: '/',
        provider: 'entra',
        state,
        tenantId,
        email: 'alice@acme.com',
      }
      const stateCookie = signCookie(JSON.stringify(statePayload), HMAC_KEY)
      const res = await app.request(`/sso/callback/entra?code=AUTHCODE&state=${state}`, {
        method: 'GET',
        headers: { cookie: `seta_sso_state=${stateCookie}` },
      })
      expect(res.status).toBe(302)
      const setCookie = res.headers.get('set-cookie') ?? ''
      expect(setCookie).toMatch(/seta_sess=/)
      expect(setCookie).toMatch(/seta_last_login=/)
      expect(autoJoined).toBe(true)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('rejects on issuer mismatch', async () => {
    const { token, jwks } = await mintIdToken({ email: 'alice@acme.com', sub: 'sub-2' })
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (input) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.endsWith('/.well-known/openid-configuration')) {
        return new Response(
          JSON.stringify({
            issuer: 'https://login.microsoftonline.com/WRONG/v2.0',
            authorization_endpoint: 'x',
            token_endpoint: 'https://login.microsoftonline.com/WRONG/oauth2/v2.0/token',
            jwks_uri: 'https://stub.test/jwks.json',
          }),
          { status: 200 },
        )
      }
      if (url === 'https://stub.test/jwks.json') return new Response(JSON.stringify(jwks))
      if (url.endsWith('/token')) return new Response(JSON.stringify({ id_token: token }))
      throw new Error('unexpected')
    }
    try {
      const app = new Hono().onError(onError)
      app.route(
        '/',
        createSsoRoutes({
          sql,
          sessionCookie: { name: 'seta_sess', hmacKey: HMAC_KEY, ttlSec: 3600, secure: false },
          redirectBase: 'http://localhost:8080',
          meContext: { resolve: async () => ({ tenant: null, isSuperadmin: false, apps: [] }) },
          tenancy: { findOrAttachUser: async () => 'attached' },
          getClientSecret: async () => 'fake',
          getTenantBrief: async () => ({ slug, displayName: 'Acme' }),
          autoJoinOnDomain: async () => {},
        }),
      )
      const state = 'state-2'
      const stateCookie = signCookie(
        JSON.stringify({
          pkce: 'v',
          returnTo: '/',
          provider: 'entra',
          state,
          tenantId,
          email: 'alice@acme.com',
        }),
        HMAC_KEY,
      )
      const res = await app.request(`/sso/callback/entra?code=X&state=${state}`, {
        method: 'GET',
        headers: { cookie: `seta_sso_state=${stateCookie}` },
      })
      expect(res.status).toBeGreaterThanOrEqual(400)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('rejects when id_token email is in a different tenant', async () => {
    const { token, jwks } = await mintIdToken({ email: 'bob@other.example', sub: 'sub-3' })
    const originalFetch = globalThis.fetch
    globalThis.fetch = buildFetchStub(token, jwks)
    try {
      const app = new Hono().onError(onError)
      app.route(
        '/',
        createSsoRoutes({
          sql,
          sessionCookie: { name: 'seta_sess', hmacKey: HMAC_KEY, ttlSec: 3600, secure: false },
          redirectBase: 'http://localhost:8080',
          meContext: { resolve: async () => ({ tenant: null, isSuperadmin: false, apps: [] }) },
          tenancy: { findOrAttachUser: async () => 'attached' },
          getClientSecret: async () => 'fake',
          getTenantBrief: async () => ({ slug, displayName: 'Acme' }),
          autoJoinOnDomain: async () => {},
        }),
      )
      const state = 'state-3'
      const stateCookie = signCookie(
        JSON.stringify({
          pkce: 'v',
          returnTo: '/',
          provider: 'entra',
          state,
          tenantId,
          email: 'alice@acme.com',
        }),
        HMAC_KEY,
      )
      const res = await app.request(`/sso/callback/entra?code=X&state=${state}`, {
        method: 'GET',
        headers: { cookie: `seta_sso_state=${stateCookie}` },
      })
      expect(res.status).toBe(400)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
