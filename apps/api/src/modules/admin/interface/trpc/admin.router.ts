import * as z from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import type { AuthContext } from '../../../../common/trpc/auth-middleware'
import { PERMISSIONS } from '../../../../common/auth/permissions'
import { AdminRouterService } from './admin-router.service'
import { QueryAuditLogQuery } from '../../application/queries/query-audit-log.query'
import { ExportAuditLogQuery } from '../../application/queries/export-audit-log.query'
import { GetTenantTimezoneQuery } from '../../application/queries/get-tenant-timezone.query'
import { UpdateTenantTimezoneCommand } from '../../application/commands/update-tenant-timezone.command'
import { ListPlatformTenantsQuery } from '../../application/queries/list-platform-tenants.query'
import { UpdateTargetTenantStatusCommand } from '../../application/commands/update-target-tenant-status.command'
import { GetTenantAdminSummaryQuery } from '../../application/queries/get-tenant-admin-summary.query'
import { UpdateModuleTogglesCommand } from '../../application/commands/update-module-toggles.command'
import { UpsertAiProviderConfigCommand } from '../../application/commands/upsert-ai-provider-config.command'

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
      .meta({ permission: PERMISSIONS.ADMIN_ROLE_READ })
      .input(z.object({}))
      .query(({ ctx }: { ctx: AuthContext }) => svc().kernelQuery.listRoles(ctx.tenantId)),

    getPermissions: permissionProtectedProcedure
      .meta({ permission: PERMISSIONS.ADMIN_ROLE_READ })
      .input(z.object({ roleKey: roleKeyEnum }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .query(({ ctx, input }: { ctx: AuthContext; input: any }) =>
        svc().kernelQuery.getRolePermissions(input.roleKey, ctx.tenantId),
      ),

    addPermission: permissionProtectedProcedure
      .meta({ permission: PERMISSIONS.ADMIN_ROLE_MANAGE })
      .input(
        z.object({
          roleKey: roleKeyEnum,
          permissionKey: z.string().min(1).max(255).regex(permissionKeyRegex),
        }),
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mutation(({ ctx, input }: { ctx: AuthContext; input: any }) =>
        svc().kernelPermission.addRolePermission(
          ctx.tenantId,
          input.roleKey,
          input.permissionKey,
          ctx.actorId,
        ),
      ),

    removePermission: permissionProtectedProcedure
      .meta({ permission: PERMISSIONS.ADMIN_ROLE_MANAGE })
      .input(
        z.object({
          roleKey: roleKeyEnum,
          permissionKey: z.string().min(1).max(255),
        }),
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mutation(({ ctx, input }: { ctx: AuthContext; input: any }) =>
        svc().kernelPermission.removeRolePermission(
          ctx.tenantId,
          input.roleKey,
          input.permissionKey,
          ctx.actorId,
        ),
      ),

    resetToDefaults: permissionProtectedProcedure
      .meta({ permission: PERMISSIONS.ADMIN_ROLE_MANAGE })
      .input(
        z.object({
          roleKey: roleKeyEnum,
        }),
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mutation(({ ctx, input }: { ctx: AuthContext; input: any }) =>
        svc().kernelPermission.resetRolePermissions(ctx.tenantId, input.roleKey, ctx.actorId),
      ),
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createAdminAuditLogRouter(permissionProtectedProcedure: any) {
  return router({
    query: permissionProtectedProcedure
      .meta({ permission: PERMISSIONS.ADMIN_AUDIT_READ })
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      .meta({ permission: PERMISSIONS.ADMIN_AUDIT_READ })
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
export function createAdminPlatformRouter(permissionProtectedProcedure: any) {
  return router({
    listTenants: permissionProtectedProcedure
      .meta({ permission: PERMISSIONS.ADMIN_PLATFORM_READ })
      .input(z.object({}))
      .query(() => svc().query(new ListPlatformTenantsQuery())),

    updateTenantStatus: permissionProtectedProcedure
      .meta({ permission: PERMISSIONS.ADMIN_PLATFORM_MANAGE })
      .input(
        z.object({
          tenantId: z.string().uuid(),
          status: z.enum(['active', 'suspended', 'cancelled']),
        }),
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mutation(({ ctx, input }: { ctx: AuthContext; input: any }) =>
        svc().command(
          new UpdateTargetTenantStatusCommand(
            ctx.tenantId,
            ctx.actorId,
            input.tenantId,
            input.status,
          ),
        ),
      ),
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createAdminRouter(permissionProtectedProcedure: any) {
  return router({
    roles: createAdminRolesRouter(permissionProtectedProcedure),
    auditLog: createAdminAuditLogRouter(permissionProtectedProcedure),
    platform: createAdminPlatformRouter(permissionProtectedProcedure),

    getTenantTimezone: permissionProtectedProcedure
      .meta({ permission: PERMISSIONS.ADMIN_TENANT_READ })
      .input(z.object({}))
      .query(async ({ ctx }: { ctx: AuthContext }) => {
        const timezone = await svc().query(new GetTenantTimezoneQuery(ctx.tenantId))
        return { timezone: timezone as string }
      }),

    updateTimezone: permissionProtectedProcedure
      .meta({ permission: PERMISSIONS.ADMIN_TENANT_TIMEZONE_UPDATE })
      .input(z.object({ timezone: z.string().min(1).max(64) }))
      .mutation(async ({ ctx, input }: { ctx: AuthContext; input: { timezone: string } }) => {
        await svc().command(new UpdateTenantTimezoneCommand(ctx.tenantId, input.timezone))
      }),

    getTenantAdminSummary: permissionProtectedProcedure
      .meta({ permission: PERMISSIONS.ADMIN_TENANT_READ })
      .input(z.object({ tenantId: z.string().uuid() }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .query(({ ctx, input }: { ctx: AuthContext; input: any }) =>
        svc().query(
          new GetTenantAdminSummaryQuery(ctx.tenantId, ctx.actorId, ctx.roles, input.tenantId),
        ),
      ),

    updateModuleToggles: permissionProtectedProcedure
      .meta({ permission: PERMISSIONS.ADMIN_MODULE_MANAGE })
      .input(
        z.object({
          tenantId: z.string().uuid(),
          toggles: z.array(
            z.object({
              moduleKey: z.string().min(1).max(64),
              enabled: z.boolean(),
            }),
          ),
        }),
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mutation(({ ctx, input }: { ctx: AuthContext; input: any }) =>
        svc().command(
          new UpdateModuleTogglesCommand(
            input.tenantId,
            ctx.actorId,
            input.toggles,
            ctx.tenantId,
            ctx.roles,
          ),
        ),
      ),

    upsertAiProviderConfig: permissionProtectedProcedure
      .meta({ permission: PERMISSIONS.ADMIN_AI_MANAGE })
      .input(
        z.object({
          tenantId: z.string().uuid(),
          rawApiKey: z.string().min(1),
          providerType: z.enum(['openai']),
          defaultReasoningModel: z.string().min(1).max(128).default('gpt-5.4'),
          defaultClassificationModel: z.string().min(1).max(128).default('gpt-5.4-nano'),
          embeddingModel: z.string().min(1).max(128).default('text-embedding-3-small'),
        }),
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mutation(({ ctx, input }: { ctx: AuthContext; input: any }) =>
        svc().command(
          new UpsertAiProviderConfigCommand(
            input.tenantId,
            ctx.actorId,
            input.rawApiKey,
            input.providerType,
            input.defaultReasoningModel,
            input.defaultClassificationModel,
            input.embeddingModel,
            ctx.tenantId,
            ctx.roles,
          ),
        ),
      ),
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

export const adminPlatformRouter = router({
  listTenants: publicProcedure.input(z.object({})).query(() => []),
  updateTenantStatus: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        status: z.enum(['active', 'suspended', 'cancelled']),
      }),
    )
    .mutation(() => null),
})

export const adminRouter = router({
  roles: adminRolesRouter,
  auditLog: adminAuditLogRouter,
  platform: adminPlatformRouter,
  getTenantTimezone: publicProcedure.input(z.object({})).query(() => ({ timezone: '' })),
  updateTimezone: publicProcedure.input(z.object({ timezone: z.string() })).mutation(() => null),
  getTenantAdminSummary: publicProcedure
    .input(z.object({ tenantId: z.string().uuid() }))
    .query(() => null),
  updateModuleToggles: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        toggles: z.array(z.object({ moduleKey: z.string(), enabled: z.boolean() })),
      }),
    )
    .mutation(() => null),
  upsertAiProviderConfig: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        rawApiKey: z.string(),
        providerType: z.enum(['openai']),
        defaultReasoningModel: z.string().default('gpt-5.4'),
        defaultClassificationModel: z.string().default('gpt-5.4-nano'),
        embeddingModel: z.string().default('text-embedding-3-small'),
      }),
    )
    .mutation(() => null),
})
