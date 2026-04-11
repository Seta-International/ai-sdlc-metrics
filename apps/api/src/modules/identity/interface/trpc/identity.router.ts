import { z } from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import type { TrpcContext } from '../../../../common/trpc/trpc-init'
import { IdentityTrpcService } from './identity-trpc.service'
import { ConfigureIdentityProviderCommand } from '../../application/commands/configure-identity-provider.command'
import { TestIdpConnectionCommand } from '../../application/commands/test-idp-connection.command'
import { SyncIdpGroupsCommand } from '../../application/commands/sync-idp-groups.command'
import { UpsertGroupMappingCommand } from '../../application/commands/upsert-group-mapping.command'
import { RemoveGroupMappingCommand } from '../../application/commands/remove-group-mapping.command'
import { GetIdentityProviderQuery } from '../../application/queries/get-identity-provider.query'
import { ListGroupMappingsQuery } from '../../application/queries/list-group-mappings.query'

type AuthCtx = TrpcContext & { actorId: string; tenantId: string }
const svc = () => IdentityTrpcService.getInstance()

// Factory for permission-aware router
export function createIdentityRouter(
  permissionProtectedProcedure: ReturnType<typeof publicProcedure.use>,
) {
  return router({
    configureProvider: permissionProtectedProcedure
      .meta({ permission: 'admin:tenant:manage' })
      .input(
        z.object({
          providerType: z.enum(['microsoft', 'google']),
          displayName: z.string().min(1).max(100),
          clientId: z.string().min(1).max(255),
          clientSecretRef: z.string().min(1).max(512),
          directoryId: z.string().min(1).max(255).optional(),
          isPrimary: z.boolean(),
          syncEnabled: z.boolean(),
          existingProviderId: z.string().uuid().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { actorId, tenantId } = ctx as unknown as AuthCtx
        return svc().command(
          new ConfigureIdentityProviderCommand(
            tenantId,
            input.providerType,
            input.displayName,
            input.clientId,
            input.clientSecretRef,
            input.directoryId ?? null,
            input.isPrimary,
            input.syncEnabled,
            actorId,
            input.existingProviderId,
          ),
        )
      }),

    getProvider: permissionProtectedProcedure
      .meta({ permission: 'admin:tenant:manage' })
      .query(async ({ ctx }) => {
        const { tenantId } = ctx as unknown as AuthCtx
        return svc().query(new GetIdentityProviderQuery(tenantId))
      }),

    testConnection: permissionProtectedProcedure
      .meta({ permission: 'admin:tenant:manage' })
      .input(z.object({ providerId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { actorId, tenantId } = ctx as unknown as AuthCtx
        return svc().command(new TestIdpConnectionCommand(tenantId, input.providerId, actorId))
      }),

    syncGroups: permissionProtectedProcedure
      .meta({ permission: 'admin:role:manage' })
      .mutation(async ({ ctx }) => {
        const { actorId, tenantId } = ctx as unknown as AuthCtx
        return svc().command(new SyncIdpGroupsCommand(tenantId, actorId))
      }),

    listGroupMappings: permissionProtectedProcedure
      .meta({ permission: 'admin:role:manage' })
      .query(async ({ ctx }) => {
        const { tenantId } = ctx as unknown as AuthCtx
        return svc().query(new ListGroupMappingsQuery(tenantId))
      }),

    upsertGroupMapping: permissionProtectedProcedure
      .meta({ permission: 'admin:role:manage' })
      .input(
        z.object({
          identityProviderId: z.string().uuid(),
          externalGroupId: z.string().min(1).max(255),
          externalGroupName: z.string().min(1).max(255),
          roleKey: z.enum([
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
          ]),
          scopeType: z.enum(['global', 'department', 'project', 'account']),
          scopeId: z.string().uuid().nullable(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { actorId, tenantId } = ctx as unknown as AuthCtx
        const mappingId = await svc().command(
          new UpsertGroupMappingCommand(
            tenantId,
            input.identityProviderId,
            input.externalGroupId,
            input.externalGroupName,
            input.roleKey,
            input.scopeType,
            input.scopeId,
            actorId,
          ),
        )
        return { mappingId }
      }),

    removeGroupMapping: permissionProtectedProcedure
      .meta({ permission: 'admin:role:manage' })
      .input(z.object({ mappingId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { actorId, tenantId } = ctx as unknown as AuthCtx
        await svc().command(new RemoveGroupMappingCommand(tenantId, input.mappingId, actorId))
        return { success: true }
      }),
  })
}

// Empty placeholder — will be populated in Task 8 final wiring
export const identityRouter = router({})
