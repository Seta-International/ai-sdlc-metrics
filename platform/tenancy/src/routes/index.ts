import { OpenAPIHono } from '@hono/zod-openapi'
import type { MiddlewareHandler } from 'hono'
import type { Sql } from 'postgres'
import type { TenantMembershipRole } from '../service'
import { createAdminRoutes } from './admin'
import { createMembersRoutes } from './members'

export type CreateTenancyRoutesOpts = {
  sql: Sql
  requireSession: MiddlewareHandler
  membershipLookup: (userId: string) => Promise<{ role: TenantMembershipRole } | null>
  invalidateUserSessions: (userId: string) => Promise<void>
  isSuperadmin: (userId: string) => Promise<boolean>
}

export function createTenancyRoutes(opts: CreateTenancyRoutesOpts) {
  const app = new OpenAPIHono()
  app.route(
    '/',
    createMembersRoutes({
      sql: opts.sql,
      requireSession: opts.requireSession,
      membershipLookup: opts.membershipLookup,
      invalidateUserSessions: opts.invalidateUserSessions,
    }),
  )
  app.route(
    '/',
    createAdminRoutes({
      sql: opts.sql,
      requireSession: opts.requireSession,
      isSuperadmin: opts.isSuperadmin,
    }),
  )
  return app
}
