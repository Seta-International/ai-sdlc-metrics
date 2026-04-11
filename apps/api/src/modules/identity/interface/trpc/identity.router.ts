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
import { InviteLocalUserCommand } from '../../application/commands/invite-local-user.command'
import { DeactivateLocalUserCommand } from '../../application/commands/deactivate-local-user.command'
import { ListLocalUsersQuery } from '../../application/queries/list-local-users.query'
import { GetSyncStatusQuery } from '../../application/queries/get-sync-status.query'
import { GetSyncHistoryQuery } from '../../application/queries/get-sync-history.query'
import { TriggerDirectorySyncCommand } from '../../application/commands/trigger-directory-sync.command'
import { CreateSystemActorCommand } from '../../application/commands/create-system-actor.command'
import { CreateApiKeyCommand } from '../../application/commands/create-api-key.command'
import { RevokeApiKeyCommand } from '../../application/commands/revoke-api-key.command'
import { ListApiKeysQuery } from '../../application/queries/list-api-keys.query'

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
          existingProviderId: z.uuid().optional(),
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
      .input(z.object({ providerId: z.uuid() }))
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
          identityProviderId: z.uuid(),
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
          scopeId: z.uuid().nullable(),
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
      .input(z.object({ mappingId: z.uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { actorId, tenantId } = ctx as unknown as AuthCtx
        await svc().command(new RemoveGroupMappingCommand(tenantId, input.mappingId, actorId))
        return { success: true }
      }),

    inviteLocalUser: permissionProtectedProcedure
      .meta({ permission: 'admin:tenant:manage' })
      .input(
        z.object({
          email: z.email(),
          displayName: z.string().min(1).max(200),
          roleAssignments: z
            .array(
              z.object({
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
                scopeId: z.uuid().nullable(),
              }),
            )
            .min(1),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { actorId, tenantId } = ctx as unknown as AuthCtx
        return svc().command(
          new InviteLocalUserCommand(
            tenantId,
            input.email,
            input.displayName,
            input.roleAssignments,
            actorId,
          ),
        )
      }),

    listLocalUsers: permissionProtectedProcedure
      .meta({ permission: 'admin:tenant:manage' })
      .query(async ({ ctx }) => {
        const { tenantId } = ctx as unknown as AuthCtx
        return svc().query(new ListLocalUsersQuery(tenantId))
      }),

    deactivateLocalUser: permissionProtectedProcedure
      .meta({ permission: 'admin:tenant:manage' })
      .input(z.object({ actorId: z.uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { actorId, tenantId } = ctx as unknown as AuthCtx
        await svc().command(new DeactivateLocalUserCommand(tenantId, input.actorId, actorId))
        return { success: true }
      }),

    getSyncStatus: permissionProtectedProcedure
      .meta({ permission: 'admin:tenant:manage' })
      .query(async ({ ctx }) => {
        const { tenantId } = ctx as unknown as AuthCtx
        return svc().query(new GetSyncStatusQuery(tenantId))
      }),

    getSyncHistory: permissionProtectedProcedure
      .meta({ permission: 'admin:tenant:manage' })
      .input(
        z.object({
          limit: z.number().int().min(1).max(100).default(20),
        }),
      )
      .query(async ({ ctx, input }) => {
        const { tenantId } = ctx as unknown as AuthCtx
        return svc().query(new GetSyncHistoryQuery(tenantId, input.limit))
      }),

    triggerSync: permissionProtectedProcedure
      .meta({ permission: 'admin:tenant:manage' })
      .mutation(async ({ ctx }) => {
        const { actorId, tenantId } = ctx as unknown as AuthCtx
        return svc().command(new TriggerDirectorySyncCommand(tenantId, actorId))
      }),

    createSystemActor: permissionProtectedProcedure
      .meta({ permission: 'admin:agent:manage' })
      .input(z.object({ displayName: z.string().min(1).max(200) }))
      .mutation(async ({ ctx, input }) => {
        const { actorId, tenantId } = ctx as unknown as AuthCtx
        return svc().command(new CreateSystemActorCommand(tenantId, input.displayName, actorId))
      }),

    createApiKey: permissionProtectedProcedure
      .meta({ permission: 'admin:agent:manage' })
      .input(
        z.object({
          actorId: z.uuid(),
          name: z.string().min(1).max(200),
          expiresAt: z
            .string()
            .datetime()
            .nullable()
            .transform((v) => (v ? new Date(v) : null)),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { actorId, tenantId } = ctx as unknown as AuthCtx
        return svc().command(
          new CreateApiKeyCommand(tenantId, input.actorId, input.name, input.expiresAt, actorId),
        )
      }),

    listApiKeys: permissionProtectedProcedure
      .meta({ permission: 'admin:agent:manage' })
      .query(async ({ ctx }) => {
        const { tenantId } = ctx as unknown as AuthCtx
        return svc().query(new ListApiKeysQuery(tenantId))
      }),

    revokeApiKey: permissionProtectedProcedure
      .meta({ permission: 'admin:agent:manage' })
      .input(z.object({ apiKeyId: z.uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { actorId, tenantId } = ctx as unknown as AuthCtx
        await svc().command(new RevokeApiKeyCommand(tenantId, input.apiKeyId, actorId))
        return { success: true }
      }),
  })
}

// Placeholder — populated during final router wiring
export const identityRouter = router({})
