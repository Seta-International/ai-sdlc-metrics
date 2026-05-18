import { signCookie, verifyCookie as verifyCookieFn } from '@seta/identity'
import type { MiddlewareHandler } from 'hono'
import { setCookie } from 'hono/cookie'

export const KNOWN_APPS = ['studio', 'finance', 'pmo', 'timesheet'] as const
export type KnownApp = (typeof KNOWN_APPS)[number]

const isKnownApp = (v: string): v is KnownApp => (KNOWN_APPS as readonly string[]).includes(v)

export type LastAppMiddlewareOpts = {
  hmacKey: string
  secure: boolean
}

export function lastAppMiddleware(opts: LastAppMiddlewareOpts): MiddlewareHandler {
  return async (c, next) => {
    await next()
    if (c.req.method !== 'GET') return
    const accept = c.req.header('accept') ?? ''
    if (!accept.includes('text/html')) return
    const path = c.req.path
    // Match /<app> or /<app>/...
    const seg = path.split('/').filter(Boolean)[0]
    if (!seg || !isKnownApp(seg)) return
    setCookie(c, 'seta_last_app', signCookie(seg, opts.hmacKey), {
      httpOnly: true,
      secure: opts.secure,
      sameSite: 'Lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 90,
    })
  }
}

export function verifyLastApp(raw: string | undefined, hmacKey: string): KnownApp | null {
  if (!raw) return null
  const inner = verifyCookieFn(raw, hmacKey)
  if (!inner) return null
  return isKnownApp(inner) ? inner : null
}
