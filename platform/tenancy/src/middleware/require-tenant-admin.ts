import { Forbidden } from '@seta/middleware'
import type { Context, MiddlewareHandler } from 'hono'
import type { TenantMembershipRole } from '../service'

export type RequireTenantAdminOpts = {
  /** Resolve the session user id from request context. Default reads `c.get('userId')`. */
  getUser?: (c: Context) => string | undefined
  lookup: (userId: string) => Promise<{ role: TenantMembershipRole } | null>
}

const defaultGetUser = (c: Context) => c.get('userId') as string | undefined

export function requireTenantAdmin(opts: RequireTenantAdminOpts): MiddlewareHandler {
  const getUser = opts.getUser ?? defaultGetUser
  return async (c, next) => {
    const userId = getUser(c)
    if (!userId) throw new Forbidden('not authenticated')
    const m = await opts.lookup(userId)
    if (!m) throw new Forbidden('no membership')
    if (m.role !== 'admin' && m.role !== 'owner') throw new Forbidden('tenant admin required')
    await next()
  }
}
