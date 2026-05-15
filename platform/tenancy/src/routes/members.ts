import { OpenAPIHono } from '@hono/zod-openapi'
import { NotFound } from '@seta/middleware'
import type { MiddlewareHandler } from 'hono'
import type { Sql } from 'postgres'
import { z } from 'zod'
import { tenantContext } from '../context'
import { requireTenantAdmin } from '../middleware/require-tenant-admin'
import type { TenantMembershipRole } from '../service'
import { listMembers, removeMember, setMemberRole } from '../service/members'

export type MembersRoutesDeps = {
  sql: Sql
  requireSession: MiddlewareHandler
  membershipLookup: (userId: string) => Promise<{ role: TenantMembershipRole } | null>
  invalidateUserSessions: (userId: string) => Promise<void>
}

const RoleBody = z.object({ role: z.enum(['owner', 'admin', 'member']) })

export function createMembersRoutes(deps: MembersRoutesDeps) {
  const app = new OpenAPIHono()
  app.use('*', deps.requireSession)
  app.use('*', requireTenantAdmin({ lookup: deps.membershipLookup }))

  app.get('/members', async (c) => {
    const tenantId = tenantContext.getTenantId()
    const members = await listMembers(deps.sql, tenantId)
    return c.json({ members })
  })

  app.patch('/members/:userId', async (c) => {
    const tenantId = tenantContext.getTenantId()
    const userId = c.req.param('userId')
    const body = RoleBody.parse(await c.req.json())
    const row = await setMemberRole(deps.sql, tenantId, userId, body.role).catch((e) => {
      if (e instanceof Error && e.message === 'member not found')
        throw new NotFound('member not found')
      throw e
    })
    await deps.invalidateUserSessions(userId)
    return c.json({ member: row })
  })

  app.delete('/members/:userId', async (c) => {
    const tenantId = tenantContext.getTenantId()
    const userId = c.req.param('userId')
    await removeMember(deps.sql, tenantId, userId)
    await deps.invalidateUserSessions(userId)
    return c.json({ ok: true })
  })

  return app
}
