import { timingSafeEqual } from 'node:crypto'
import { Unauthorized } from '@seta/middleware'
import { logger } from '@seta/observability'
import type { MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import { verifyCookie } from './cookie'
import { deriveCsrfToken } from './csrf'
import type { Session } from './schema'

export type SsoVariables = {
  userId: string
  sessionId: string
}

export interface SessionStore {
  get(sessionId: string): Promise<Session | null>
}

export type RequireSessionOpts = {
  cookieName: string
  hmacKey: string
  sessionStore: SessionStore
}

export function requireSession(opts: RequireSessionOpts): MiddlewareHandler<{
  Variables: SsoVariables
}> {
  return async (c, next) => {
    const raw = getCookie(c, opts.cookieName)
    if (!raw) throw new Unauthorized('missing session cookie')
    const sessionId = verifyCookie(raw, opts.hmacKey)
    if (!sessionId) {
      logger.warn({ event: 'sso.cookie_invalid' }, '[sso] cookie HMAC verify failed')
      throw new Unauthorized('invalid session cookie')
    }
    const row = await opts.sessionStore.get(sessionId)
    if (!row) {
      logger.warn({ event: 'sso.session_not_found', sessionId }, '[sso] session row not found')
      throw new Unauthorized('session not found')
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      logger.warn({ event: 'sso.session_expired', sessionId }, '[sso] session expired')
      throw new Unauthorized('session expired')
    }
    c.set('sessionId', sessionId)
    c.set('userId', row.userId)
    await next()
  }
}

export type CsrfOpts = {
  hmacKey: string
}

export function csrfMiddleware(opts: CsrfOpts): MiddlewareHandler<{ Variables: SsoVariables }> {
  return async (c, next) => {
    const sessionId = c.get('sessionId')
    if (!sessionId) throw new Unauthorized('csrf: no session in context')
    const given = c.req.header('x-csrf-token')
    if (!given) throw new Unauthorized('csrf: missing token')
    const expected = deriveCsrfToken(sessionId, opts.hmacKey)
    const a = Buffer.from(given)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new Unauthorized('csrf: token mismatch')
    }
    await next()
  }
}
