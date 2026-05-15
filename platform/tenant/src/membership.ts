import { Forbidden, Unauthorized } from '@seta/middleware'
import type { Context, MiddlewareHandler } from 'hono'
import type { TenantMembershipRole } from './service'

export type TenantMembership = { role: TenantMembershipRole }

export type RequireTenantMembershipOpts = {
  /**
   * Resolve session user id from request context. Default reads
   * `c.get('sessionUser')?.id` (set by @seta/identity requireSession) and falls
   * back to the `x-session-user` header (test seam).
   */
  sessionUser?: (c: Context) => string | undefined
  lookup: (args: { userId: string; tenantId: string }) => Promise<TenantMembership | null>
  /** Route param name. Default `'id'` to match `/tenants/:id/*`. */
  paramName?: string
}

declare module 'hono' {
  interface ContextVariableMap {
    membership: TenantMembership
  }
}

const defaultSessionUser = (c: Context) =>
  (c.get('sessionUser') as { id?: string } | undefined)?.id ?? c.req.header('x-session-user')

export function requireTenantMembership(opts: RequireTenantMembershipOpts): MiddlewareHandler {
  const getUser = opts.sessionUser ?? defaultSessionUser
  const paramName = opts.paramName ?? 'id'
  return async (c, next) => {
    const userId = getUser(c)
    if (!userId) throw new Unauthorized('no session user')
    const tenantId = c.req.param(paramName)
    if (!tenantId) throw new Forbidden('missing tenant route param')
    const row = await opts.lookup({ userId, tenantId })
    if (!row) throw new Forbidden('not a member of this tenant')
    c.set('membership', row)
    await next()
  }
}
