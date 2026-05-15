import { OpenAPIHono } from '@hono/zod-openapi'
import { Forbidden } from '@seta/middleware'
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

// inlined to avoid tenancy → identity cycle (identity → tenancy already exists)
function inlineRequireSuperadmin(lookup: (userId: string) => Promise<boolean>): MiddlewareHandler {
  return async (c, next) => {
    const userId = c.get('userId') as string | undefined
    if (!userId) throw new Forbidden('not authenticated')
    if (!(await lookup(userId))) throw new Forbidden('superadmin required')
    await next()
  }
}

export function createAdminRoutes(deps: AdminRoutesDeps) {
  const app = new OpenAPIHono()
  app.use('*', deps.requireSession)
  app.use('*', inlineRequireSuperadmin(deps.isSuperadmin))

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
