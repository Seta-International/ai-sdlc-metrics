import { OpenAPIHono } from '@hono/zod-openapi'
import type { AuditWriter } from '@seta/audit'
import { NotFound } from '@seta/middleware'
import type { Context, MiddlewareHandler } from 'hono'
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
  audit: AuditWriter
}

const RoleBody = z.object({ role: z.enum(['owner', 'admin', 'member']) })

export function createMembersRoutes(deps: MembersRoutesDeps) {
  const app = new OpenAPIHono()
  app.use('/members', deps.requireSession)
  app.use('/members/*', deps.requireSession)
  app.use('/members', requireTenantAdmin({ lookup: deps.membershipLookup }))
  app.use('/members/*', requireTenantAdmin({ lookup: deps.membershipLookup }))

  app.get('/members', async (c) => {
    const tenantId = tenantContext.getTenantId()
    const members = await listMembers(deps.sql, tenantId)
    return c.json({ members })
  })

  app.patch('/members/:userId', async (c) => {
    const tenantId = tenantContext.getTenantId()
    const actorUserId = (c as Context).get('userId') as string
    const targetUserId = c.req.param('userId')
    const body = RoleBody.parse(await c.req.json())

    const prevRows = (await deps.sql`
      SELECT role FROM tenant.tenant_members
       WHERE tenant_id = ${tenantId} AND user_id = ${targetUserId} LIMIT 1
    `) as Array<{ role: TenantMembershipRole }>
    const prev = prevRows[0]?.role ?? null

    const row = await setMemberRole(deps.sql, tenantId, targetUserId, body.role).catch((e) => {
      if (e instanceof Error && e.message === 'member not found')
        throw new NotFound('member not found')
      throw e
    })
    await deps.invalidateUserSessions(targetUserId)
    await deps.audit.recordAudit({
      tenantId,
      actor: { type: 'user', userId: actorUserId },
      operation: 'tenancy.role_changed',
      resource: { type: 'tenant_member', ids: [targetUserId] },
      result: 'ok',
      metadata: { from: prev, to: body.role },
    })
    return c.json({ member: row })
  })

  app.delete('/members/:userId', async (c) => {
    const tenantId = tenantContext.getTenantId()
    const actorUserId = (c as Context).get('userId') as string
    const targetUserId = c.req.param('userId')
    await removeMember(deps.sql, tenantId, targetUserId)
    await deps.invalidateUserSessions(targetUserId)
    await deps.audit.recordAudit({
      tenantId,
      actor: { type: 'user', userId: actorUserId },
      operation: 'tenancy.member_removed',
      resource: { type: 'tenant_member', ids: [targetUserId] },
      result: 'ok',
    })
    return c.json({ ok: true })
  })

  return app
}
