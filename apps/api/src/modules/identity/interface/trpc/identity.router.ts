import { z } from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
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

export const identityAdminRouter = router({
  // --- IdP Configuration ---
  configureProvider: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        actorId: z.string().uuid(),
        providerType: z.enum(['microsoft', 'google']),
        displayName: z.string().min(1).max(100),
        clientId: z.string().min(1).max(255),
        clientSecretRef: z.string().min(1).max(512).startsWith('arn:aws:secretsmanager:'),
        directoryId: z.string().min(1).max(255),
        syncEnabled: z.boolean(),
        existingProviderId: z.string().uuid().optional(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new ConfigureIdentityProviderCommand(
          input.tenantId,
          input.providerType,
          input.displayName,
          input.clientId,
          input.clientSecretRef,
          input.directoryId,
          input.syncEnabled,
          input.actorId,
          input.existingProviderId,
        ),
      ),
    ),

  getProvider: publicProcedure
    .input(z.object({ tenantId: z.string().uuid() }))
    .query(({ input }) => svc().query(new GetIdentityProviderQuery(input.tenantId))),

  testConnection: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        actorId: z.string().uuid(),
        providerId: z.string().uuid(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(new TestIdpConnectionCommand(input.tenantId, input.providerId, input.actorId)),
    ),

  // --- Group Mappings ---
  syncGroups: publicProcedure
    .input(z.object({ tenantId: z.string().uuid(), actorId: z.string().uuid() }))
    .mutation(({ input }) =>
      svc().command(new SyncIdpGroupsCommand(input.tenantId, input.actorId)),
    ),

  listGroupMappings: publicProcedure
    .input(z.object({ tenantId: z.string().uuid() }))
    .query(({ input }) => svc().query(new ListGroupMappingsQuery(input.tenantId))),

  upsertGroupMapping: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        actorId: z.string().uuid(),
        identityProviderId: z.string().uuid(),
        externalGroupId: z.string().min(1).max(255),
        externalGroupName: z.string().min(1).max(255),
        roleKey: roleKeyEnum,
        scopeType: scopeTypeEnum,
        scopeId: z.string().uuid().nullable(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new UpsertGroupMappingCommand(
          input.tenantId,
          input.identityProviderId,
          input.externalGroupId,
          input.externalGroupName,
          input.roleKey,
          input.scopeType,
          input.scopeId,
          input.actorId,
        ),
      ),
    ),

  removeGroupMapping: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        actorId: z.string().uuid(),
        mappingId: z.string().uuid(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(new RemoveGroupMappingCommand(input.tenantId, input.mappingId, input.actorId)),
    ),

  // --- Local Accounts ---
  inviteLocalUser: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        actorId: z.string().uuid(),
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
    .mutation(({ input }) =>
      svc().command(
        new InviteLocalUserCommand(
          input.tenantId,
          input.email,
          input.displayName,
          input.roleAssignments,
          input.actorId,
        ),
      ),
    ),

  listLocalUsers: publicProcedure
    .input(z.object({ tenantId: z.string().uuid() }))
    .query(({ input }) => svc().query(new ListLocalUsersQuery(input.tenantId))),

  deactivateLocalUser: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        actorId: z.string().uuid(),
        targetActorId: z.string().uuid(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new DeactivateLocalUserCommand(input.tenantId, input.targetActorId, input.actorId),
      ),
    ),

  // --- Sync Monitoring ---
  getSyncStatus: publicProcedure
    .input(z.object({ tenantId: z.string().uuid() }))
    .query(({ input }) => svc().query(new GetSyncStatusQuery(input.tenantId))),

  getSyncHistory: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(({ input }) =>
      svc().query(new GetSyncHistoryQuery(input.tenantId, input.limit, input.offset)),
    ),

  triggerSync: publicProcedure
    .input(z.object({ tenantId: z.string().uuid(), actorId: z.string().uuid() }))
    .mutation(({ input }) =>
      svc().command(new TriggerDirectorySyncCommand(input.tenantId, input.actorId)),
    ),

  // --- Agent Access ---
  createSystemActor: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        actorId: z.string().uuid(),
        displayName: z.string().min(1).max(200),
      }),
    )
    .mutation(({ input }) =>
      svc().command(new CreateSystemActorCommand(input.tenantId, input.displayName, input.actorId)),
    ),

  createApiKey: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        actorId: z.string().uuid(),
        systemActorId: z.string().uuid(),
        name: z.string().min(1).max(200),
        expiresAt: z
          .string()
          .datetime()
          .nullable()
          .transform((v) => (v ? new Date(v) : null)),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new CreateApiKeyCommand(
          input.tenantId,
          input.systemActorId,
          input.name,
          input.expiresAt,
          input.actorId,
        ),
      ),
    ),

  listApiKeys: publicProcedure
    .input(z.object({ tenantId: z.string().uuid() }))
    .query(({ input }) => svc().query(new ListApiKeysQuery(input.tenantId))),

  revokeApiKey: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        actorId: z.string().uuid(),
        apiKeyId: z.string().uuid(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(new RevokeApiKeyCommand(input.tenantId, input.apiKeyId, input.actorId)),
    ),
})
