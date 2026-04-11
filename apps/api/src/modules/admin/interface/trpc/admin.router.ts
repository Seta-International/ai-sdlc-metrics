import { z } from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import type { TrpcContext } from '../../../../common/trpc/trpc-init'
import { AdminTrpcService } from './admin-trpc.service'
import { ListRolesQuery } from '../../application/queries/list-roles.query'
import { GetRolePermissionsQuery } from '../../application/queries/get-role-permissions.query'
import { AddRolePermissionCommand } from '../../application/commands/add-role-permission.command'
import { RemoveRolePermissionCommand } from '../../application/commands/remove-role-permission.command'
import { ResetRolePermissionsCommand } from '../../application/commands/reset-role-permissions.command'
import { QueryAuditLogQuery } from '../../application/queries/query-audit-log.query'
import { ExportAuditLogQuery } from '../../application/queries/export-audit-log.query'

type AuthCtx = TrpcContext & { actorId: string; tenantId: string }
const svc = () => AdminTrpcService.getInstance()

const auditLogFilterInput = z.object({
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
})

const auditLogExportInput = z.object({
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
})

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

export function createAdminRouter(
  permissionProtectedProcedure: ReturnType<typeof publicProcedure.use>,
) {
  const auditLogRouter = router({
    query: permissionProtectedProcedure
      .meta({ permission: 'admin:audit:read' })
      .input(auditLogFilterInput)
      .query(async ({ ctx, input }) => {
        const { tenantId } = ctx as unknown as AuthCtx
        return svc().query(
          new QueryAuditLogQuery(
            tenantId,
            input.actorId,
            input.eventType,
            input.module,
            input.dateFrom,
            input.dateTo,
            input.limit,
            input.offset,
          ),
        )
      }),

    export: permissionProtectedProcedure
      .meta({ permission: 'admin:audit:read' })
      .input(auditLogExportInput)
      .query(async ({ ctx, input }) => {
        const { tenantId } = ctx as unknown as AuthCtx
        const csv = await svc().query(
          new ExportAuditLogQuery(
            tenantId,
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

  return router({
    auditLog: auditLogRouter,
    roles: router({
      list: permissionProtectedProcedure
        .meta({ permission: 'admin:role:manage' })
        .query(async ({ ctx }) => {
          const { tenantId } = ctx as unknown as AuthCtx
          return svc().query(new ListRolesQuery(tenantId))
        }),

      getPermissions: permissionProtectedProcedure
        .meta({ permission: 'admin:role:manage' })
        .input(z.object({ roleKey: roleKeyEnum }))
        .query(async ({ ctx, input }) => {
          const { tenantId } = ctx as unknown as AuthCtx
          return svc().query(new GetRolePermissionsQuery(tenantId, input.roleKey))
        }),

      addPermission: permissionProtectedProcedure
        .meta({ permission: 'admin:role:manage' })
        .input(z.object({ roleKey: roleKeyEnum, permissionKey: z.string().min(1).max(255) }))
        .mutation(async ({ ctx, input }) => {
          const { actorId, tenantId } = ctx as unknown as AuthCtx
          const permissionId = await svc().command(
            new AddRolePermissionCommand(tenantId, input.roleKey, input.permissionKey, actorId),
          )
          return { permissionId }
        }),

      removePermission: permissionProtectedProcedure
        .meta({ permission: 'admin:role:manage' })
        .input(z.object({ roleKey: roleKeyEnum, permissionKey: z.string().min(1).max(255) }))
        .mutation(async ({ ctx, input }) => {
          const { actorId, tenantId } = ctx as unknown as AuthCtx
          await svc().command(
            new RemoveRolePermissionCommand(tenantId, input.roleKey, input.permissionKey, actorId),
          )
          return { success: true }
        }),

      resetToDefaults: permissionProtectedProcedure
        .meta({ permission: 'admin:role:manage' })
        .input(z.object({ roleKey: roleKeyEnum }))
        .mutation(async ({ ctx, input }) => {
          const { actorId, tenantId } = ctx as unknown as AuthCtx
          await svc().command(new ResetRolePermissionsCommand(tenantId, input.roleKey, actorId))
          return { success: true }
        }),
    }),
  })
}

// Empty placeholder — will be populated in Task 8 final wiring
export const adminRouter = router({})
