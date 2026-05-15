import { Forbidden } from '@seta/middleware'
import type { MiddlewareHandler } from 'hono'
import type { SsoVariables } from '../middleware'

export type RequireSuperadminOpts = {
  lookup: (userId: string) => Promise<boolean>
}

export function requireSuperadmin(
  opts: RequireSuperadminOpts,
): MiddlewareHandler<{ Variables: SsoVariables }> {
  return async (c, next) => {
    const userId = c.get('userId')
    if (!userId) throw new Forbidden('not authenticated')
    const ok = await opts.lookup(userId)
    if (!ok) throw new Forbidden('superadmin required')
    await next()
  }
}
