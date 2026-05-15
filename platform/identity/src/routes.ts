import { BadRequest, NotFound, Unauthorized } from '@seta/middleware'
import { logger } from '@seta/observability'
import type { AttachStatus, MeContextProvider } from '@seta/tenancy'
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { Sql } from 'postgres'
import { signCookie, verifyCookie } from './cookie'
import { deriveCsrfToken } from './csrf'
import { resolveNextUrl } from './me/resolve-next-url'
import { csrfMiddleware, requireSession, type SsoVariables } from './middleware'
import { generatePkce } from './pkce'
import type { SsoProvider } from './provider'
import { LoginBody, LoginResponse, MeResponse, ProviderParam, type SessionUser } from './schemas'
import { createSessionStore } from './session-store'
import { upsertUserByIdentity } from './users-repo'

export type SsoRoutesDeps = {
  providers: { entra: SsoProvider; google: SsoProvider }
  enabledProviders: Array<'entra' | 'google'>
  sql: Sql
  sessionCookie: { name: string; hmacKey: string; ttlSec: number; secure: boolean }
  redirectBase: string
  meContext: MeContextProvider
  tenancy: { findOrAttachUser: (userId: string) => Promise<AttachStatus> }
}

const STATE_COOKIE_TTL_SEC = 600
const STATE_COOKIE_NAME = 'seta_sso_state'

type StatePayload = {
  pkce: string
  returnTo: string
  provider: 'entra' | 'google'
  state: string
}

export function createSsoRoutes(deps: SsoRoutesDeps): Hono<{ Variables: SsoVariables }> {
  const store = createSessionStore(deps.sql)
  const app = new Hono<{ Variables: SsoVariables }>()

  app.get('/sso/providers', (c) => c.json({ providers: deps.enabledProviders }))

  app.post('/sso/login/:provider', async (c) => {
    const providerId = ProviderParam.parse(c.req.param('provider'))
    if (!deps.enabledProviders.includes(providerId)) throw new NotFound('provider disabled')
    const provider = deps.providers[providerId]
    if (!provider) throw new BadRequest(`unknown provider '${providerId}'`)
    const body = LoginBody.parse(await c.req.json().catch(() => ({})))
    const returnTo = body.returnTo ?? '/'

    const { verifier, challenge } = generatePkce()
    const state = crypto.randomUUID()
    const payload: StatePayload = { pkce: verifier, returnTo, provider: providerId, state }
    const signed = signCookie(JSON.stringify(payload), deps.sessionCookie.hmacKey)

    setCookie(c, STATE_COOKIE_NAME, signed, {
      httpOnly: true,
      secure: deps.sessionCookie.secure,
      sameSite: 'Lax',
      path: '/',
      maxAge: STATE_COOKIE_TTL_SEC,
    })

    const url = provider.authorizeUrl({
      state,
      pkce: challenge,
      redirectUri: `${deps.redirectBase}/sso/callback/${providerId}`,
    })
    logger.info({ event: 'sso.login_start', provider: providerId }, '[sso] login start')
    return c.json(LoginResponse.parse({ url }))
  })

  app.get('/sso/callback/:provider', async (c) => {
    const providerId = ProviderParam.parse(c.req.param('provider'))
    const provider = deps.providers[providerId]
    if (!provider) throw new BadRequest(`unknown provider '${providerId}'`)

    const code = c.req.query('code')
    const state = c.req.query('state')
    if (!code || !state) throw new BadRequest('missing code or state')

    const stateCookie = getCookie(c, STATE_COOKIE_NAME)
    if (!stateCookie) throw new BadRequest('missing state cookie')
    const verified = verifyCookie(stateCookie, deps.sessionCookie.hmacKey)
    if (!verified) throw new BadRequest('state cookie invalid')

    const parsed = JSON.parse(verified) as StatePayload
    if (parsed.state !== state) throw new BadRequest('state mismatch')
    if (parsed.provider !== providerId) throw new BadRequest('state provider mismatch')

    const idToken = await provider.exchangeCode({
      code,
      pkce: parsed.pkce,
      redirectUri: `${deps.redirectBase}/sso/callback/${providerId}`,
    })

    const user = await upsertUserByIdentity(deps.sql, {
      provider: providerId,
      subject: idToken.sub,
      email: idToken.email,
      name: idToken.name ?? idToken.email,
      pictureUrl: idToken.picture ?? null,
    })

    const sessionId = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + deps.sessionCookie.ttlSec * 1000)
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? null
    const ua = c.req.header('user-agent') ?? null
    await store.insert({ id: sessionId, userId: user.id, expiresAt, ip, userAgent: ua })

    setCookie(c, deps.sessionCookie.name, signCookie(sessionId, deps.sessionCookie.hmacKey), {
      httpOnly: true,
      secure: deps.sessionCookie.secure,
      sameSite: 'Lax',
      path: '/',
      maxAge: deps.sessionCookie.ttlSec,
    })
    deleteCookie(c, STATE_COOKIE_NAME, { path: '/' })

    logger.info(
      { event: 'sso.login_complete', userId: user.id, provider: providerId },
      '[sso] login complete',
    )

    const status = await deps.tenancy.findOrAttachUser(user.id)
    const lastApp = getCookie(c, 'seta_last_app') ?? null
    const next =
      status === 'superadmin'
        ? '/console/admin/tenants'
        : status === 'no-membership'
          ? '/console/no-workspace'
          : resolveNextUrl({ returnTo: parsed.returnTo, lastApp })

    return c.redirect(next)
  })

  app.post(
    '/sso/logout',
    requireSession({
      cookieName: deps.sessionCookie.name,
      hmacKey: deps.sessionCookie.hmacKey,
      sessionStore: store,
    }),
    async (c) => {
      const sessionId = c.get('sessionId')
      await store.delete(sessionId)
      deleteCookie(c, deps.sessionCookie.name, { path: '/' })
      logger.info({ event: 'sso.logout', sessionId }, '[sso] logout')
      return c.json({ ok: true })
    },
  )

  app.get(
    '/me',
    requireSession({
      cookieName: deps.sessionCookie.name,
      hmacKey: deps.sessionCookie.hmacKey,
      sessionStore: store,
    }),
    async (c) => {
      const userId = c.get('userId')
      const sessionId = c.get('sessionId')
      const rows = await deps.sql<
        Array<{ id: string; email: string; name: string; picture_url: string | null }>
      >`SELECT id, email, name, picture_url FROM auth.users WHERE id = ${userId} LIMIT 1`
      const u = rows[0]
      if (!u) throw new Unauthorized('user not found')
      const user: SessionUser = {
        id: u.id,
        email: u.email,
        name: u.name,
        pictureUrl: u.picture_url,
      }
      const ctx = await deps.meContext.resolve(userId)
      const csrfToken = deriveCsrfToken(sessionId, deps.sessionCookie.hmacKey)
      return c.json(
        MeResponse.parse({
          user,
          tenant: ctx.tenant,
          isSuperadmin: ctx.isSuperadmin,
          apps: ctx.apps,
          csrfToken,
        }),
      )
    },
  )

  return app
}

export { csrfMiddleware }
