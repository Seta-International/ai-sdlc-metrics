import { z } from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import type { AuthContext } from '../../../../common/trpc/auth-middleware'
import { AdminRouterService } from './admin-router.service'
import { ListRolesQuery } from '../../application/queries/list-roles.query'
import { GetRolePermissionsQuery } from '../../application/queries/get-role-permissions.query'
import { AddRolePermissionCommand } from '../../application/commands/add-role-permission.command'
import { RemoveRolePermissionCommand } from '../../application/commands/remove-role-permission.command'
import { ResetRolePermissionsCommand } from '../../application/commands/reset-role-permissions.command'
import { QueryAuditLogQuery } from '../../application/queries/query-audit-log.query'
import { ExportAuditLogQuery } from '../../application/queries/export-audit-log.query'

function svc() {
  return AdminRouterService.getInstance()
}

const roleKeyEnum = z.enum([
  'hr_ops',
  'line_manager',
  'project_manager',
  'staffing_owner',
  'account_manager',
  'finance_operator',
  'executive',
  'employee',
  'review_operator',
  'recruiter',
  'tenant_admin',
  'platform_admin',
])

const permissionKeyRegex = /^[a-z]+:[a-z_]+(?::[a-z_]+)*$/

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createAdminRolesRouter(permissionProtectedProcedure: any) {
  return router({
    list: permissionProtectedProcedure
      .meta({ permission: 'admin:role:read' })
      .input(z.object({}))
      .query(({ ctx }: { ctx: AuthContext }) => svc().query(new ListRolesQuery(ctx.tenantId))),

    getPermissions: permissionProtectedProcedure
      .meta({ permission: 'admin:role:read' })
      .input(z.object({ roleKey: roleKeyEnum }))
      .query(({ ctx, input }: { ctx: AuthContext; input: any }) =>
        svc().query(new GetRolePermissionsQuery(ctx.tenantId, input.roleKey)),
      ),

    addPermission: permissionProtectedProcedure
      .meta({ permission: 'admin:role:manage' })
      .input(
        z.object({
          roleKey: roleKeyEnum,
          permissionKey: z.string().min(1).max(255).regex(permissionKeyRegex),
        }),
      )
      .mutation(({ ctx, input }: { ctx: AuthContext; input: any }) =>
        svc().command(
          new AddRolePermissionCommand(
            ctx.tenantId,
            input.roleKey,
            input.permissionKey,
            ctx.actorId,
          ),
        ),
      ),

    removePermission: permissionProtectedProcedure
      .meta({ permission: 'admin:role:manage' })
      .input(
        z.object({
          roleKey: roleKeyEnum,
          permissionKey: z.string().min(1).max(255),
        }),
      )
      .mutation(({ ctx, input }: { ctx: AuthContext; input: any }) =>
        svc().command(
          new RemoveRolePermissionCommand(
            ctx.tenantId,
            input.roleKey,
            input.permissionKey,
            ctx.actorId,
          ),
        ),
      ),

    resetToDefaults: permissionProtectedProcedure
      .meta({ permission: 'admin:role:manage' })
      .input(
        z.object({
          roleKey: roleKeyEnum,
        }),
      )
      .mutation(({ ctx, input }: { ctx: AuthContext; input: any }) =>
        svc().command(new ResetRolePermissionsCommand(ctx.tenantId, input.roleKey, ctx.actorId)),
      ),
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createAdminAuditLogRouter(permissionProtectedProcedure: any) {
  return router({
    query: permissionProtectedProcedure
      .meta({ permission: 'admin:audit:read' })
      .input(
        z.object({
          actorId: z.string().uuid().optional(),
          eventType: z.string().max(100).optional(),
          module: z.string().max(50).optional(),
          dateFrom: z
            .string()
            .datetime()
            .optional()
            .transform((v: string | undefined) => (v ? new Date(v) : undefined)),
          dateTo: z
            .string()
            .datetime()
            .optional()
            .transform((v: string | undefined) => (v ? new Date(v) : undefined)),
          limit: z.number().int().min(1).max(100).default(50),
          offset: z.number().int().min(0).default(0),
        }),
      )
      .query(({ ctx, input }: { ctx: AuthContext; input: any }) =>
        svc().query(
          new QueryAuditLogQuery(
            ctx.tenantId,
            input.actorId,
            input.eventType,
            input.module,
            input.dateFrom,
            input.dateTo,
            input.limit,
            input.offset,
          ),
        ),
      ),

    export: permissionProtectedProcedure
      .meta({ permission: 'admin:audit:read' })
      .input(
        z.object({
          actorId: z.string().uuid().optional(),
          eventType: z.string().max(100).optional(),
          module: z.string().max(50).optional(),
          dateFrom: z
            .string()
            .datetime()
            .optional()
            .transform((v: string | undefined) => (v ? new Date(v) : undefined)),
          dateTo: z
            .string()
            .datetime()
            .optional()
            .transform((v: string | undefined) => (v ? new Date(v) : undefined)),
        }),
      )
      .query(async ({ ctx, input }: { ctx: AuthContext; input: any }) => {
        const csv = await svc().query(
          new ExportAuditLogQuery(
            ctx.tenantId,
            input.actorId,
            input.eventType,
            input.module,
            input.dateFrom,
            input.dateTo,
          ),
        )
        return { csv }
      }),
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createAdminRouter(permissionProtectedProcedure: any) {
  return router({
    roles: createAdminRolesRouter(permissionProtectedProcedure),
    auditLog: createAdminAuditLogRouter(permissionProtectedProcedure),
  })
}

// Backward-compatible exports — replaced at runtime by TrpcModule with permission-enforcing versions
export const adminRolesRouter = router({
  list: publicProcedure.input(z.object({})).query(() => null),
  getPermissions: publicProcedure.input(z.object({})).query(() => null),
  addPermission: publicProcedure.input(z.object({})).mutation(() => null),
  removePermission: publicProcedure.input(z.object({})).mutation(() => null),
  resetToDefaults: publicProcedure.input(z.object({})).mutation(() => null),
})

export const adminAuditLogRouter = router({
  query: publicProcedure.input(z.object({})).query(() => null),
  export: publicProcedure.input(z.object({})).query(() => null),
})

export const adminRouter = router({
  roles: adminRolesRouter,
  auditLog: adminAuditLogRouter,
})
