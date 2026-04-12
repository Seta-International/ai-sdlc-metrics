import { z } from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
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

export const adminRolesRouter = router({
  list: publicProcedure
    .input(z.object({ tenantId: z.string().uuid() }))
    .query(({ input }) => svc().query(new ListRolesQuery(input.tenantId))),

  getPermissions: publicProcedure
    .input(z.object({ tenantId: z.string().uuid(), roleKey: roleKeyEnum }))
    .query(({ input }) => svc().query(new GetRolePermissionsQuery(input.tenantId, input.roleKey))),

  addPermission: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        actorId: z.string().uuid(),
        roleKey: roleKeyEnum,
        permissionKey: z.string().min(1).max(255).regex(permissionKeyRegex),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new AddRolePermissionCommand(
          input.tenantId,
          input.roleKey,
          input.permissionKey,
          input.actorId,
        ),
      ),
    ),

  removePermission: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        actorId: z.string().uuid(),
        roleKey: roleKeyEnum,
        permissionKey: z.string().min(1).max(255),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new RemoveRolePermissionCommand(
          input.tenantId,
          input.roleKey,
          input.permissionKey,
          input.actorId,
        ),
      ),
    ),

  resetToDefaults: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        actorId: z.string().uuid(),
        roleKey: roleKeyEnum,
      }),
    )
    .mutation(({ input }) =>
      svc().command(new ResetRolePermissionsCommand(input.tenantId, input.roleKey, input.actorId)),
    ),
})

export const adminAuditLogRouter = router({
  query: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        actorId: z.string().uuid().optional(),
        eventType: z.string().max(100).optional(),
        module: z.string().max(50).optional(),
        dateFrom: z
          .string()
          .datetime()
          .optional()
          .transform((v) => (v ? new Date(v) : undefined)),
        dateTo: z
          .string()
          .datetime()
          .optional()
          .transform((v) => (v ? new Date(v) : undefined)),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(({ input }) =>
      svc().query(
        new QueryAuditLogQuery(
          input.tenantId,
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

  export: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        actorId: z.string().uuid().optional(),
        eventType: z.string().max(100).optional(),
        module: z.string().max(50).optional(),
        dateFrom: z
          .string()
          .datetime()
          .optional()
          .transform((v) => (v ? new Date(v) : undefined)),
        dateTo: z
          .string()
          .datetime()
          .optional()
          .transform((v) => (v ? new Date(v) : undefined)),
      }),
    )
    .query(async ({ input }) => {
      const csv = await svc().query(
        new ExportAuditLogQuery(
          input.tenantId,
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

export const adminRouter = router({
  roles: adminRolesRouter,
  auditLog: adminAuditLogRouter,
})
