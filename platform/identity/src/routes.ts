import { BadRequest, NotFound, Unauthorized } from '@seta/middleware'
import { logger } from '@seta/observability'
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { Sql } from 'postgres'
import { signCookie, verifyCookie } from './cookie'
import { deriveCsrfToken } from './csrf'
import { LAST_LOGIN_COOKIE_NAME, signLastLoginHint } from './last-login'
import { resolveNextUrl } from './me/resolve-next-url'
import type { AttachStatus, MeContextProvider } from './me-context-provider'
import { csrfMiddleware, requireSession, type SsoVariables } from './middleware'
import { generatePkce } from './pkce'
import { ssoProviderFor } from './providers/entra-factory'
import { DiscoverBody, MeResponse, type SessionUser, StartBody } from './schemas'
import { createSessionStore } from './session-store'
import { getSsoConfigByTenant, resolveSsoByEmail } from './sso-config-repo'
import { upsertUserByIdentity } from './users-repo'

export type SsoRoutesDeps = {
  sql: Sql
  sessionCookie: { name: string; hmacKey: string; ttlSec: number; secure: boolean }
  redirectBase: string
  meContext: MeContextProvider
  tenancy: { findOrAttachUser: (userId: string) => Promise<AttachStatus> }
  /** Look up a vault entry containing the client secret. */
  getClientSecret: (input: { tenantId: string; vaultId: string | null }) => Promise<string>
  /** Look up tenant display info for the discover/start response. */
  getTenantBrief: (tenantId: string) => Promise<{ slug: string; displayName: string } | null>
  /** Auto-join after SSO callback when the user has no membership. */
  autoJoinOnDomain: (input: { userId: string; tenantId: string }) => Promise<void>
  verifyLastApp?: (raw: string | undefined) => string | null
}

const STATE_COOKIE_TTL_SEC = 600
const STATE_COOKIE_NAME = 'seta_sso_state'
const LAST_LOGIN_TTL_SEC = 30 * 24 * 60 * 60

type StatePayload = {
  pkce: string
  returnTo: string
  provider: 'entra'
  state: string
  tenantId: string
  email: string
}

export function createSsoRoutes(deps: SsoRoutesDeps): Hono<{ Variables: SsoVariables }> {
  const store = createSessionStore(deps.sql)
  const app = new Hono<{ Variables: SsoVariables }>()

  app.post('/sso/discover', async (c) => {
    const body = DiscoverBody.parse(await c.req.json().catch(() => ({})))
    const hit = await resolveSsoByEmail(deps.sql, body.email)
    if (!hit) {
      logger.info({ event: 'sso.discover_miss' }, '[sso] discover miss')
      return c.json({ ok: false as const, error: 'no_workspace_for_email' as const })
    }
    const brief = await deps.getTenantBrief(hit.tenantId)
    if (!brief) {
      logger.warn(
        { event: 'sso.discover_miss', tenantId: hit.tenantId },
        '[sso] discover tenant brief missing',
      )
      return c.json({ ok: false as const, error: 'no_workspace_for_email' as const })
    }
    logger.info(
      { event: 'sso.discover_hit', tenant_id: hit.tenantId, provider: hit.provider },
      '[sso] discover hit',
    )
    return c.json({
      ok: true as const,
      provider: hit.provider,
      tenantSlug: brief.slug,
      displayName: brief.displayName,
    })
  })

  app.post('/sso/start', async (c) => {
    const body = StartBody.parse(await c.req.json().catch(() => ({})))
    const returnTo = body.returnTo ?? '/'

    const hit = await resolveSsoByEmail(deps.sql, body.email)
    if (!hit) throw new NotFound('no workspace for email')

    const cfg = await getSsoConfigByTenant(deps.sql, hit.tenantId)
    if (!cfg) throw new NotFound('sso config missing')

    const clientSecret = await deps.getClientSecret({
      tenantId: hit.tenantId,
      vaultId: cfg.secretVaultId,
    })
    const provider = ssoProviderFor(cfg.row, clientSecret)

    const { verifier, challenge } = generatePkce()
    const state = crypto.randomUUID()
    const payload: StatePayload = {
      pkce: verifier,
      returnTo,
      provider: 'entra',
      state,
      tenantId: hit.tenantId,
      email: body.email,
    }
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
      redirectUri: `${deps.redirectBase}/sso/callback/entra`,
      loginHint: body.email,
    })

    logger.info({ event: 'sso.start', tenant_id: hit.tenantId, provider: 'entra' }, '[sso] start')
    return c.json({ url })
  })

  app.get('/sso/callback/entra', async (c) => {
    const code = c.req.query('code')
    const state = c.req.query('state')
    if (!code || !state) throw new BadRequest('missing code or state')

    const stateCookie = getCookie(c, STATE_COOKIE_NAME)
    if (!stateCookie) throw new BadRequest('missing state cookie')
    const verified = verifyCookie(stateCookie, deps.sessionCookie.hmacKey)
    if (!verified) throw new BadRequest('state cookie invalid')
    const parsed = JSON.parse(verified) as StatePayload
    if (parsed.state !== state) throw new BadRequest('state mismatch')
    if (parsed.provider !== 'entra') throw new BadRequest('state provider mismatch')

    const cfg = await getSsoConfigByTenant(deps.sql, parsed.tenantId)
    if (!cfg) throw new BadRequest('sso config missing')

    const clientSecret = await deps.getClientSecret({
      tenantId: parsed.tenantId,
      vaultId: cfg.secretVaultId,
    })
    const provider = ssoProviderFor(cfg.row, clientSecret)

    const idToken = await provider.exchangeCode({
      code,
      pkce: parsed.pkce,
      redirectUri: `${deps.redirectBase}/sso/callback/entra`,
    })

    if (cfg.row.provider === 'entra') {
      const expectedIssuerPrefix = `https://login.microsoftonline.com/${cfg.row.config.entra_tenant_id}/`
      if (!idToken.iss.startsWith(expectedIssuerPrefix)) {
        logger.warn(
          {
            event: 'sso.callback_fail',
            tenant_id: parsed.tenantId,
            reason: 'issuer_mismatch',
            got: idToken.iss,
          },
          '[sso] issuer mismatch',
        )
        throw new BadRequest('issuer mismatch')
      }
    }

    const emailHit = await resolveSsoByEmail(deps.sql, idToken.email)
    if (!emailHit || emailHit.tenantId !== parsed.tenantId) {
      logger.warn(
        {
          event: 'sso.callback_fail',
          tenant_id: parsed.tenantId,
          reason: 'email_domain_mismatch',
        },
        '[sso] email domain mismatch',
      )
      throw new BadRequest('email domain not in tenant allowlist')
    }

    const user = await upsertUserByIdentity(deps.sql, {
      provider: 'entra',
      subject: idToken.sub,
      email: idToken.email,
      name: idToken.name ?? idToken.email,
      pictureUrl: idToken.picture ?? null,
    })

    await deps.autoJoinOnDomain({ userId: user.id, tenantId: parsed.tenantId })

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

    const brief = await deps.getTenantBrief(parsed.tenantId)
    if (brief) {
      const hint = signLastLoginHint(
        {
          email: idToken.email,
          provider: 'entra',
          tenantDisplayName: brief.displayName,
          ts: Math.floor(Date.now() / 1000),
        },
        deps.sessionCookie.hmacKey,
      )
      setCookie(c, LAST_LOGIN_COOKIE_NAME, hint, {
        httpOnly: false,
        secure: deps.sessionCookie.secure,
        sameSite: 'Lax',
        path: '/',
        maxAge: LAST_LOGIN_TTL_SEC,
      })
    }

    deleteCookie(c, STATE_COOKIE_NAME, { path: '/' })

    logger.info(
      {
        event: 'sso.callback_ok',
        tenant_id: parsed.tenantId,
        provider: 'entra',
        user_id: user.id,
      },
      '[sso] callback ok',
    )

    const status = await deps.tenancy.findOrAttachUser(user.id)
    const rawLastApp = getCookie(c, 'seta_last_app') ?? undefined
    const lastApp = deps.verifyLastApp ? deps.verifyLastApp(rawLastApp) : null
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
