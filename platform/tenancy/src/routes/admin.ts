import { OpenAPIHono } from '@hono/zod-openapi'
import { requireSuperadmin } from '@seta/identity'
import type { MiddlewareHandler } from 'hono'
import type { Sql } from 'postgres'

export type AdminRoutesDeps = {
  sql: Sql
  requireSession: MiddlewareHandler
  isSuperadmin: (userId: string) => Promise<boolean>
}

type TenantRow = {
  id: string
  slug: string
  displayName: string | null
  status: string
  createdAt: string
}

export function createAdminRoutes(deps: AdminRoutesDeps) {
  const app = new OpenAPIHono()
  app.use('/admin/*', deps.requireSession)
  app.use('/admin/*', requireSuperadmin({ lookup: deps.isSuperadmin }))

  app.get('/admin/tenants', async (c) => {
    const rows = (await deps.sql`
      SELECT id::text       AS id,
             slug,
             display_name   AS "displayName",
             status,
             created_at     AS "createdAt"
      FROM tenant.tenants
      ORDER BY created_at DESC
    `) as TenantRow[]
    return c.json({ tenants: rows })
  })

  return app
}
