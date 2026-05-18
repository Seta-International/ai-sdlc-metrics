import { randomUUID } from 'node:crypto'
import type { Mailer } from '@seta/mailer'
import { BadRequest } from '@seta/middleware'
import { logger } from '@seta/observability'
import { Hono } from 'hono'
import { setCookie } from 'hono/cookie'
import type { Sql } from 'postgres'
import { type AuditWriter, recordSsoAudit } from './admin-audit'
import { signCookie } from './cookie'
import { LAST_LOGIN_COOKIE_NAME, signLastLoginHint } from './last-login'
import { expiresAtFromNow, hashToken, MAGIC_LINK_TTL_MS, mintToken } from './magic-link'
import { consumeMagicLink, insertMagicLink } from './magic-link-repo'
import { magicLinkMessage } from './mail-templates/magic-link'
import type { SsoVariables } from './middleware'
import { createSessionStore } from './session-store'
import { resolveSsoByEmail } from './sso-config-repo'

export type MagicLinkRoutesDeps = {
  sql: Sql
  audit: AuditWriter
  sessionCookie: { name: string; hmacKey: string; ttlSec: number; secure: boolean }
  redirectBase: string
  /** Resolves the mailer for the given tenant. */
  getMailerForTenant: (tenantId: string) => Promise<Mailer>
  /** Resolves tenant display info for the email template and last-login cookie. */
  getTenantBrief: (tenantId: string) => Promise<{ slug: string; displayName: string } | null>
}

const TTL_MIN = MAGIC_LINK_TTL_MS / 60_000

export function createMagicLinkRoutes(
  deps: MagicLinkRoutesDeps,
): Hono<{ Variables: SsoVariables }> {
  const store = createSessionStore(deps.sql)
  const app = new Hono<{ Variables: SsoVariables }>()

  app.post('/sso/magic/request', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { email?: string; returnTo?: string }
    const email = String(body.email ?? '')
      .trim()
      .toLowerCase()
    if (!email) throw new BadRequest('email required')
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? null

    // Always 200 to avoid enumeration. Side effects gated on real ownership.
    const hit = await resolveSsoByEmail(deps.sql, email)
    if (!hit) {
      logger.info(
        { event: 'sso.magic_request', sent: false, reason: 'no_tenant' },
        '[sso] magic request (no tenant)',
      )
      return c.json({ ok: true })
    }

    const userRows = (await deps.sql`
      SELECT u.id AS user_id
      FROM auth.users u
      JOIN tenant.tenant_members m ON m.user_id = u.id
      WHERE u.email = ${email}
        AND m.tenant_id = ${hit.tenantId}
        AND m.role = 'owner'
      LIMIT 1
    `) as Array<{ user_id: string }>
    const owner = userRows[0]
    if (!owner) {
      logger.info(
        { event: 'sso.magic_request', tenant_id: hit.tenantId, sent: false, reason: 'not_owner' },
        '[sso] magic request (not owner)',
      )
      return c.json({ ok: true })
    }

    const raw = mintToken()
    const tokenHash = hashToken(raw)
    await insertMagicLink(deps.sql, {
      userId: owner.user_id,
      tenantId: hit.tenantId,
      tokenHash,
      expiresAt: expiresAtFromNow(),
      requestedIp: ip,
    })

    const brief = await deps.getTenantBrief(hit.tenantId)
    const tenantDisplayName = brief?.displayName ?? 'Seta'
    const link = `${deps.redirectBase}/sso/magic/consume?t=${encodeURIComponent(raw)}`
    const msg = magicLinkMessage({
      to: email,
      link,
      tenantDisplayName,
      expiresInMin: TTL_MIN,
    })

    try {
      const mailer = await deps.getMailerForTenant(hit.tenantId)
      await mailer.send(msg)
      await recordSsoAudit(deps.audit, {
        event: 'sso.magic_link_issued',
        actorUserId: owner.user_id,
        tenantId: hit.tenantId,
        metadata: { email_hash: tokenHash.toString('hex').slice(0, 16) },
      })
      logger.info(
        { event: 'sso.magic_request', tenant_id: hit.tenantId, sent: true },
        '[sso] magic request sent',
      )
    } catch (err) {
      logger.error(
        { event: 'sso.magic_request_failed', tenant_id: hit.tenantId, err },
        '[sso] magic send failed',
      )
      // Do NOT delete the row; let it expire. Owner can retry within rate limits.
    }

    return c.json({ ok: true })
  })

  app.get('/sso/magic/consume', async (c) => {
    const raw = c.req.query('t')
    if (!raw) throw new BadRequest('missing token')
    const ok = await consumeMagicLink(deps.sql, raw)
    if (!ok) {
      logger.warn({ event: 'sso.magic_consume_fail' }, '[sso] magic consume rejected')
      return c.redirect('/console/login?magic_failed=1')
    }
    const sessionId = randomUUID()
    const expiresAt = new Date(Date.now() + deps.sessionCookie.ttlSec * 1000)
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? null
    const ua = c.req.header('user-agent') ?? null
    await store.insert({ id: sessionId, userId: ok.userId, expiresAt, ip, userAgent: ua })

    setCookie(c, deps.sessionCookie.name, signCookie(sessionId, deps.sessionCookie.hmacKey), {
      httpOnly: true,
      secure: deps.sessionCookie.secure,
      sameSite: 'Lax',
      path: '/',
      maxAge: deps.sessionCookie.ttlSec,
    })

    const brief = await deps.getTenantBrief(ok.tenantId)
    if (brief) {
      const rows = (await deps.sql`
        SELECT email FROM auth.users WHERE id = ${ok.userId} LIMIT 1
      `) as Array<{ email: string }>
      const email = rows[0]?.email
      if (email) {
        const hint = signLastLoginHint(
          {
            email,
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
          maxAge: 30 * 24 * 60 * 60,
        })
      }
    }

    await recordSsoAudit(deps.audit, {
      event: 'sso.magic_link_consumed',
      actorUserId: ok.userId,
      tenantId: ok.tenantId,
    })
    logger.info(
      { event: 'sso.magic_consume_ok', tenant_id: ok.tenantId, user_id: ok.userId },
      '[sso] magic consume ok',
    )
    return c.redirect(`/console/admin/tenants/${ok.tenantId}/sso`)
  })

  return app
}
