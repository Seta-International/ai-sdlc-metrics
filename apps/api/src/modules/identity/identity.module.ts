import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { KernelModule } from '../kernel/kernel.module'
import { AdminModule } from '../admin/admin.module'

import { IDENTITY_PROVIDER_REPOSITORY } from './domain/repositories/identity-provider.repository'
import { IDP_GROUP_MAPPING_REPOSITORY } from './domain/repositories/idp-group-mapping.repository'
import { MAGIC_LINK_TOKEN_REPOSITORY } from './domain/repositories/magic-link-token.repository'
import { API_KEY_REPOSITORY } from './domain/repositories/api-key.repository'
import { SYNC_HISTORY_REPOSITORY } from './domain/repositories/sync-history.repository'
import { IDP_GROUP_MEMBER_REPOSITORY } from './domain/repositories/idp-group-member.repository'
import { MS_GRAPH_CREDENTIAL_REPOSITORY } from './domain/repositories/ms-graph-credential.repository'
import { TENANT_DOMAIN_REPOSITORY } from './domain/repositories/tenant-domain.repository'
import { OAUTH_AUTHORIZATION_SESSION_REPOSITORY } from './domain/repositories/oauth-authorization-session.repository'
import { CRYPTO_PROVIDER } from './domain/ports/crypto-provider.port'
import { JOB_SCHEDULER } from './domain/ports/job-scheduler.port'
import { MAGIC_LINK_SENDER } from './domain/ports/magic-link-sender.port'
import { LOCAL_USER_QUERY_PORT } from './domain/ports/local-user-query.port'
import { SECRETS_STORE } from './domain/ports/secrets-store.port'

import { DrizzleIdentityProviderRepository } from './infrastructure/repositories/drizzle-identity-provider.repository'
import { DrizzleIdpGroupMappingRepository } from './infrastructure/repositories/drizzle-idp-group-mapping.repository'
import { DrizzleMagicLinkTokenRepository } from './infrastructure/repositories/drizzle-magic-link-token.repository'
import { DrizzleApiKeyRepository } from './infrastructure/repositories/drizzle-api-key.repository'
import { DrizzleSyncHistoryRepository } from './infrastructure/repositories/drizzle-sync-history.repository'
import { DrizzleIdpGroupMemberRepository } from './infrastructure/repositories/drizzle-idp-group-member.repository'
import { DrizzleMsGraphCredentialRepository } from './infrastructure/repositories/drizzle-ms-graph-credential.repository'
import { DrizzleTenantDomainRepository } from './infrastructure/repositories/drizzle-tenant-domain.repository'
import { DrizzleOAuthAuthorizationSessionRepository } from './infrastructure/repositories/drizzle-oauth-authorization-session.repository'

import { DIRECTORY_PROVIDER_FACTORY } from './domain/ports/directory-provider.port'
import { DirectoryProviderFactory } from './infrastructure/providers/directory-provider.factory'
import { MsGraphTokenAcquirer } from './infrastructure/providers/microsoft/ms-graph-token-acquirer'
import { NodeCryptoProvider } from './infrastructure/providers/node-crypto.provider'
import { StubJobScheduler } from './infrastructure/jobs/stub-job-scheduler'
import { MailMagicLinkSender } from './infrastructure/mailers/mail-magic-link.sender'
import { DrizzleLocalUserQueryService } from './infrastructure/queries/drizzle-local-user-query.service'
import { AwsSecretsStoreAdapter } from './infrastructure/secrets/aws-secrets-store.adapter'

import { ConfigureIdentityProviderHandler } from './application/commands/configure-identity-provider.handler'
import { TestIdpConnectionHandler } from './application/commands/test-idp-connection.handler'
import { SyncIdpGroupsHandler } from './application/commands/sync-idp-groups.handler'
import { UpsertGroupMappingHandler } from './application/commands/upsert-group-mapping.handler'
import { RemoveGroupMappingHandler } from './application/commands/remove-group-mapping.handler'
import { InviteLocalUserHandler } from './application/commands/invite-local-user.handler'
import { DeactivateLocalUserHandler } from './application/commands/deactivate-local-user.handler'
import { TriggerDirectorySyncHandler } from './application/commands/trigger-directory-sync.handler'
import { CreateSystemActorHandler } from './application/commands/create-system-actor.handler'
import { CreateApiKeyHandler } from './application/commands/create-api-key.handler'
import { RevokeApiKeyHandler } from './application/commands/revoke-api-key.handler'
import { UpdateIdpGroupMappingHandler } from './application/commands/update-idp-group-mapping.handler'
import { RequestMagicLinkHandler } from './application/commands/request-magic-link.handler'
import { ValidateMagicLinkHandler } from './application/commands/validate-magic-link.handler'
import { RunDirectorySyncHandler } from './application/commands/run-directory-sync.handler'

import { GetIdentityProviderHandler } from './application/queries/get-identity-provider.handler'
import { ListGroupMappingsHandler } from './application/queries/list-group-mappings.handler'
import { ListLocalUsersHandler } from './application/queries/list-local-users.handler'
import { GetSyncStatusHandler } from './application/queries/get-sync-status.handler'
import { GetSyncHistoryHandler } from './application/queries/get-sync-history.handler'
import { ListApiKeysHandler } from './application/queries/list-api-keys.handler'
import { GetIdpGroupMappingsHandler } from './application/queries/get-idp-group-mappings.handler'
import { ValidateApiKeyHandler } from './application/queries/validate-api-key.handler'
import { ListGroupMembersHandler } from './application/queries/list-group-members.handler'
import { GetGraphCredentialHandler } from './application/queries/get-graph-credential.handler'
import { GetLoginOptionsHandler } from './application/queries/get-login-options.handler'

import { IdentityQueryFacade } from './application/facades/identity-query.facade'
import { IdentityRouterService } from './interface/trpc/identity-router.service'

const CommandHandlers = [
  ConfigureIdentityProviderHandler,
  TestIdpConnectionHandler,
  SyncIdpGroupsHandler,
  UpsertGroupMappingHandler,
  RemoveGroupMappingHandler,
  InviteLocalUserHandler,
  DeactivateLocalUserHandler,
  TriggerDirectorySyncHandler,
  CreateSystemActorHandler,
  CreateApiKeyHandler,
  RevokeApiKeyHandler,
  UpdateIdpGroupMappingHandler,
  RequestMagicLinkHandler,
  ValidateMagicLinkHandler,
  RunDirectorySyncHandler,
]

const QueryHandlers = [
  GetIdentityProviderHandler,
  ListGroupMappingsHandler,
  ListLocalUsersHandler,
  GetSyncStatusHandler,
  GetSyncHistoryHandler,
  ListApiKeysHandler,
  GetIdpGroupMappingsHandler,
  ValidateApiKeyHandler,
  ListGroupMembersHandler,
  GetGraphCredentialHandler,
  GetLoginOptionsHandler,
]

@Module({
  imports: [CqrsModule, KernelModule, AdminModule],
  providers: [
    { provide: IDENTITY_PROVIDER_REPOSITORY, useClass: DrizzleIdentityProviderRepository },
    { provide: IDP_GROUP_MAPPING_REPOSITORY, useClass: DrizzleIdpGroupMappingRepository },
    { provide: MAGIC_LINK_TOKEN_REPOSITORY, useClass: DrizzleMagicLinkTokenRepository },
    { provide: API_KEY_REPOSITORY, useClass: DrizzleApiKeyRepository },
    { provide: SYNC_HISTORY_REPOSITORY, useClass: DrizzleSyncHistoryRepository },
    { provide: IDP_GROUP_MEMBER_REPOSITORY, useClass: DrizzleIdpGroupMemberRepository },
    { provide: MS_GRAPH_CREDENTIAL_REPOSITORY, useClass: DrizzleMsGraphCredentialRepository },
    { provide: TENANT_DOMAIN_REPOSITORY, useClass: DrizzleTenantDomainRepository },
    {
      provide: OAUTH_AUTHORIZATION_SESSION_REPOSITORY,
      useClass: DrizzleOAuthAuthorizationSessionRepository,
    },
    { provide: DIRECTORY_PROVIDER_FACTORY, useClass: DirectoryProviderFactory },
    {
      provide: SECRETS_STORE,
      useFactory: () =>
        new AwsSecretsStoreAdapter({ region: process.env.AWS_REGION ?? 'ap-southeast-1' }),
    },
    { provide: CRYPTO_PROVIDER, useClass: NodeCryptoProvider },
    { provide: JOB_SCHEDULER, useClass: StubJobScheduler },
    { provide: MAGIC_LINK_SENDER, useClass: MailMagicLinkSender },
    { provide: LOCAL_USER_QUERY_PORT, useClass: DrizzleLocalUserQueryService },
    MsGraphTokenAcquirer,
    ...CommandHandlers,
    ...QueryHandlers,
    IdentityQueryFacade,
    IdentityRouterService,
  ],
  exports: [IdentityQueryFacade],
})
export class IdentityModule {}
