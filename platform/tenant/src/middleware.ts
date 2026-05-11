import type { MiddlewareHandler } from 'hono'
import { tenantContext } from './context.js'

/**
 * Hono middleware that establishes tenant context for a request.
 * The caller supplies a resolver — typically reads from a header, JWT, or
 * subdomain. Returns 401 if no tenant resolved.
 */
export function tenantMiddleware(
  resolve: (
    c: Parameters<MiddlewareHandler>[0],
  ) => Promise<{ tenantId: string; userId?: string } | null>,
): MiddlewareHandler {
  return async (c, next) => {
    const resolved = await resolve(c)
    if (!resolved)
      return c.json({ status: 401, title: 'no tenant' }, 401, {
        'Content-Type': 'application/problem+json',
      })
    await tenantContext.run(resolved, async () => {
      await next()
    })
  }
}
