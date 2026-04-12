import { TRPCError } from '@trpc/server'
import type { JwtService } from '../auth/jwt.service'
import { SESSION_COOKIE_NAME } from '../auth/session-payload'

export interface AuthContext {
  actorId: string
  tenantId: string
  roles: string[]
}

function parseCookie(cookieHeader: string, name: string): string | undefined {
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return match?.[1]
}

export function createAuthMiddleware(jwtService: JwtService) {
  return async function authMiddleware(opts: {
    ctx: { req: { headers: { cookie?: string } } }
    next: (opts: { ctx: AuthContext & Record<string, unknown> }) => Promise<unknown>
    [key: string]: unknown
  }) {
    const cookieHeader = opts.ctx.req.headers.cookie ?? ''
    const token = parseCookie(cookieHeader, SESSION_COOKIE_NAME)

    if (!token) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' })
    }

    const payload = await jwtService.verify(token)
    if (!payload) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid or expired session' })
    }

    return opts.next({
      ctx: { ...opts.ctx, actorId: payload.sub, tenantId: payload.tid, roles: payload.roles },
    })
  }
}
