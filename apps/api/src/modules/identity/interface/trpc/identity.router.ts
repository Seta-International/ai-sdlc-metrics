import * as z from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import type { AuthContext } from '../../../../common/trpc/auth-middleware'
import { PERMISSIONS } from '../../../../common/auth/permissions'
import { IdentityRouterService } from './identity-router.service'
import { ConfigureIdentityProviderCommand } from '../../application/commands/configure-identity-provider.command'
import { TestIdpConnectionCommand } from '../../application/commands/test-idp-connection.command'
import { SyncIdpGroupsCommand } from '../../application/commands/sync-idp-groups.command'
import { UpsertGroupMappingCommand } from '../../application/commands/upsert-group-mapping.command'
import { RemoveGroupMappingCommand } from '../../application/commands/remove-group-mapping.command'
import { InviteLocalUserCommand } from '../../application/commands/invite-local-user.command'
import { DeactivateLocalUserCommand } from '../../application/commands/deactivate-local-user.command'
import { TriggerDirectorySyncCommand } from '../../application/commands/trigger-directory-sync.command'
import { CreateSystemActorCommand } from '../../application/commands/create-system-actor.command'
import { CreateApiKeyCommand } from '../../application/commands/create-api-key.command'
import { RevokeApiKeyCommand } from '../../application/commands/revoke-api-key.command'
import { GetIdentityProviderQuery } from '../../application/queries/get-identity-provider.query'
import { ListGroupMappingsQuery } from '../../application/queries/list-group-mappings.query'
import { ListLocalUsersQuery } from '../../application/queries/list-local-users.query'
import { GetSyncStatusQuery } from '../../application/queries/get-sync-status.query'
import { GetSyncHistoryQuery } from '../../application/queries/get-sync-history.query'
import { ListApiKeysQuery } from '../../application/queries/list-api-keys.query'

function svc() {
  return IdentityRouterService.getInstance()
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
])

const scopeTypeEnum = z.enum(['global', 'department', 'project', 'account'])

export function createIdentityAdminRouter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  permissionProtectedProcedure: any,
  _svc?: IdentityRouterService,
) {
  return router({
    // --- IdP Configuration ---
    configureProvider: permissionProtectedProcedure
      .meta({ permission: PERMISSIONS.ADMIN_IDP_CONFIGURE })
      .input(
        z.object({
          providerType: z.enum(['microsoft', 'google']),
          displayName: z.string().min(1).max(100),
          clientId: z.string().min(1).max(255),
          clientSecretRef: z.string().min(1).max(512).startsWith('arn:aws:secretsmanager:'),
          directoryId: z.string().min(1).max(255),
          syncEnabled: z.boolean(),
          existingProviderId: z.string().uuid().optional(),
        }),
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mutation(({ ctx, input }: { ctx: AuthContext; input: any }) =>
        svc().command(
          new ConfigureIdentityProviderCommand(
            ctx.tenantId,
            input.providerType,
            input.displayName,
            input.clientId,
            input.clientSecretRef,
            input.directoryId,
            input.syncEnabled,
            ctx.actorId,
            input.existingProviderId,
          ),
        ),
      ),

    getProvider: permissionProtectedProcedure
      .meta({ permission: PERMISSIONS.ADMIN_IDP_READ })
      .input(z.object({}))
      .query(({ ctx }: { ctx: AuthContext }) =>
        svc().query(new GetIdentityProviderQuery(ctx.tenantId)),
      ),

    testConnection: permissionProtectedProcedure
      .meta({ permission: PERMISSIONS.ADMIN_IDP_CONFIGURE })
      .input(
        z.object({
          providerId: z.string().uuid(),
        }),
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mutation(({ ctx, input }: { ctx: AuthContext; input: any }) =>
        svc().command(new TestIdpConnectionCommand(ctx.tenantId, input.providerId, ctx.actorId)),
      ),

    // --- Group Mappings ---
    syncGroups: permissionProtectedProcedure
      .meta({ permission: PERMISSIONS.ADMIN_IDP_SYNC })
      .input(z.object({}))
      .mutation(({ ctx }: { ctx: AuthContext }) =>
        svc().command(new SyncIdpGroupsCommand(ctx.tenantId, ctx.actorId)),
      ),

    listGroupMappings: permissionProtectedProcedure
      .meta({ permission: PERMISSIONS.ADMIN_IDP_READ })
      .input(z.object({}))
      .query(({ ctx }: { ctx: AuthContext }) =>
        svc().query(new ListGroupMappingsQuery(ctx.tenantId)),
      ),

    upsertGroupMapping: permissionProtectedProcedure
      .meta({ permission: PERMISSIONS.ADMIN_IDP_SYNC })
      .input(
        z.object({
          identityProviderId: z.string().uuid(),
          externalGroupId: z.string().min(1).max(255),
          externalGroupName: z.string().min(1).max(255),
          roleKey: roleKeyEnum,
          scopeType: scopeTypeEnum,
          scopeId: z.string().uuid().nullable(),
        }),
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mutation(({ ctx, input }: { ctx: AuthContext; input: any }) =>
        svc().command(
          new UpsertGroupMappingCommand(
            ctx.tenantId,
            input.identityProviderId,
            input.externalGroupId,
            input.externalGroupName,
            input.roleKey,
            input.scopeType,
            input.scopeId,
            ctx.actorId,
          ),
        ),
      ),

    removeGroupMapping: permissionProtectedProcedure
      .meta({ permission: PERMISSIONS.ADMIN_IDP_SYNC })
      .input(
        z.object({
          mappingId: z.string().uuid(),
        }),
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mutation(({ ctx, input }: { ctx: AuthContext; input: any }) =>
        svc().command(new RemoveGroupMappingCommand(ctx.tenantId, input.mappingId, ctx.actorId)),
      ),

    // --- Local Accounts ---
    inviteLocalUser: permissionProtectedProcedure
      .meta({ permission: PERMISSIONS.ADMIN_USER_MANAGE })
      .input(
        z.object({
          email: z.string().email(),
          displayName: z.string().min(1).max(200),
          roleAssignments: z
            .array(
              z.object({
                roleKey: roleKeyEnum,
                scopeType: scopeTypeEnum,
                scopeId: z.string().uuid().nullable(),
              }),
            )
            .min(1),
        }),
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mutation(({ ctx, input }: { ctx: AuthContext; input: any }) =>
        svc().command(
          new InviteLocalUserCommand(
            ctx.tenantId,
            input.email,
            input.displayName,
            input.roleAssignments,
            ctx.actorId,
          ),
        ),
      ),

    listLocalUsers: permissionProtectedProcedure
      .meta({ permission: PERMISSIONS.ADMIN_USER_READ })
      .input(z.object({}))
      .query(({ ctx }: { ctx: AuthContext }) => svc().query(new ListLocalUsersQuery(ctx.tenantId))),

    deactivateLocalUser: permissionProtectedProcedure
      .meta({ permission: PERMISSIONS.ADMIN_USER_MANAGE })
      .input(
        z.object({
          targetActorId: z.string().uuid(),
        }),
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mutation(({ ctx, input }: { ctx: AuthContext; input: any }) =>
        svc().command(
          new DeactivateLocalUserCommand(ctx.tenantId, input.targetActorId, ctx.actorId),
        ),
      ),

    // --- Sync Monitoring ---
    getSyncStatus: permissionProtectedProcedure
      .meta({ permission: PERMISSIONS.ADMIN_IDP_READ })
      .input(z.object({}))
      .query(({ ctx }: { ctx: AuthContext }) => svc().query(new GetSyncStatusQuery(ctx.tenantId))),

    getSyncHistory: permissionProtectedProcedure
      .meta({ permission: PERMISSIONS.ADMIN_IDP_READ })
      .input(
        z.object({
          limit: z.number().int().min(1).max(100).default(20),
          offset: z.number().int().min(0).default(0),
        }),
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .query(({ ctx, input }: { ctx: AuthContext; input: any }) =>
        svc().query(new GetSyncHistoryQuery(ctx.tenantId, input.limit, input.offset)),
      ),

    triggerSync: permissionProtectedProcedure
      .meta({ permission: PERMISSIONS.ADMIN_IDP_SYNC })
      .input(z.object({}))
      .mutation(({ ctx }: { ctx: AuthContext }) =>
        svc().command(new TriggerDirectorySyncCommand(ctx.tenantId, ctx.actorId)),
      ),

    // --- Agent Access ---
    createSystemActor: permissionProtectedProcedure
      .meta({ permission: PERMISSIONS.ADMIN_AGENT_MANAGE })
      .input(
        z.object({
          displayName: z.string().min(1).max(200),
        }),
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mutation(({ ctx, input }: { ctx: AuthContext; input: any }) =>
        svc().command(new CreateSystemActorCommand(ctx.tenantId, input.displayName, ctx.actorId)),
      ),

    createApiKey: permissionProtectedProcedure
      .meta({ permission: PERMISSIONS.ADMIN_AGENT_MANAGE })
      .input(
        z.object({
          systemActorId: z.string().uuid(),
          name: z.string().min(1).max(200),
          expiresAt: z
            .string()
            .datetime()
            .nullable()
            .transform((v) => (v ? new Date(v) : null)),
        }),
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mutation(({ ctx, input }: { ctx: AuthContext; input: any }) =>
        svc().command(
          new CreateApiKeyCommand(
            ctx.tenantId,
            input.systemActorId,
            input.name,
            input.expiresAt,
            ctx.actorId,
          ),
        ),
      ),

    listApiKeys: permissionProtectedProcedure
      .meta({ permission: PERMISSIONS.ADMIN_AGENT_READ })
      .input(z.object({}))
      .query(({ ctx }: { ctx: AuthContext }) => svc().query(new ListApiKeysQuery(ctx.tenantId))),

    revokeApiKey: permissionProtectedProcedure
      .meta({ permission: PERMISSIONS.ADMIN_AGENT_MANAGE })
      .input(
        z.object({
          apiKeyId: z.string().uuid(),
        }),
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mutation(({ ctx, input }: { ctx: AuthContext; input: any }) =>
        svc().command(new RevokeApiKeyCommand(ctx.tenantId, input.apiKeyId, ctx.actorId)),
      ),
  })
}

// Backward-compatible export — replaced at runtime by TrpcModule with permission-enforcing version
export const identityAdminRouter = router({
  configureProvider: publicProcedure.input(z.object({})).mutation(() => null),
  getProvider: publicProcedure.input(z.object({})).query(() => null),
  testConnection: publicProcedure.input(z.object({})).mutation(() => null),
  syncGroups: publicProcedure.input(z.object({})).mutation(() => null),
  listGroupMappings: publicProcedure.input(z.object({})).query(() => null),
  upsertGroupMapping: publicProcedure.input(z.object({})).mutation(() => null),
  removeGroupMapping: publicProcedure.input(z.object({})).mutation(() => null),
  inviteLocalUser: publicProcedure.input(z.object({})).mutation(() => null),
  listLocalUsers: publicProcedure.input(z.object({})).query(() => null),
  deactivateLocalUser: publicProcedure.input(z.object({})).mutation(() => null),
  getSyncStatus: publicProcedure.input(z.object({})).query(() => null),
  getSyncHistory: publicProcedure.input(z.object({})).query(() => null),
  triggerSync: publicProcedure.input(z.object({})).mutation(() => null),
  createSystemActor: publicProcedure.input(z.object({})).mutation(() => null),
  createApiKey: publicProcedure.input(z.object({})).mutation(() => null),
  listApiKeys: publicProcedure.input(z.object({})).query(() => null),
  revokeApiKey: publicProcedure.input(z.object({})).mutation(() => null),
})
