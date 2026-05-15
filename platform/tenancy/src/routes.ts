import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { Unauthorized } from '@seta/middleware'
import type { Context } from 'hono'
import type { TenantMembershipRow } from './service'

export const TenantSummary = z
  .object({
    id: z.string(),
    name: z.string(),
    role: z.enum(['owner', 'admin', 'member']),
  })
  .openapi('TenantSummary')

export type TenantSummary = z.infer<typeof TenantSummary>

const TenantSummaryList = z.array(TenantSummary)

export type CreateTenantRoutesOpts = {
  listTenants: (args: { userId: string }) => Promise<TenantMembershipRow[]>
  sessionUser?: (c: Context) => string | undefined
}

const defaultSessionUser = (c: Context) =>
  (c.get('sessionUser') as { id?: string } | undefined)?.id ?? c.req.header('x-session-user')

export function createTenantRoutes(opts: CreateTenantRoutesOpts) {
  const app = new OpenAPIHono()
  const getUser = opts.sessionUser ?? defaultSessionUser

  const route = createRoute({
    method: 'get',
    path: '/tenants',
    responses: {
      200: {
        content: { 'application/json': { schema: TenantSummaryList } },
        description: 'Tenants visible to the current session user',
      },
    },
  })

  app.openapi(route, async (c) => {
    const userId = getUser(c)
    if (!userId) throw new Unauthorized('no session user')
    const rows = await opts.listTenants({ userId })
    return c.json(rows satisfies TenantSummary[], 200)
  })

  return app
}
