import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { KernelModule } from '../kernel/kernel.module'

// Repository symbols
import { IDENTITY_PROVIDER_REPOSITORY } from './domain/repositories/identity-provider.repository'
import { IDP_GROUP_MAPPING_REPOSITORY } from './domain/repositories/idp-group-mapping.repository'
import { MAGIC_LINK_TOKEN_REPOSITORY } from './domain/repositories/magic-link-token.repository'
import { API_KEY_REPOSITORY } from './domain/repositories/api-key.repository'

// Port symbols
import { MAGIC_LINK_SENDER } from './domain/ports/magic-link-sender.port'
import { LOCAL_USER_QUERY_PORT } from './domain/ports/local-user-query.port'

// Stub implementations
import { MagicLinkSenderStub } from './infrastructure/magic-link-sender.stub'
import { LocalUserQueryStub } from './infrastructure/local-user-query.stub'

// Repository adapters
import { DrizzleIdentityProviderRepository } from './infrastructure/repositories/drizzle-identity-provider.repository'
import { DrizzleIdpGroupMappingRepository } from './infrastructure/repositories/drizzle-idp-group-mapping.repository'
import { DrizzleMagicLinkTokenRepository } from './infrastructure/repositories/drizzle-magic-link-token.repository'
import { DrizzleApiKeyRepository } from './infrastructure/repositories/drizzle-api-key.repository'

// Provider factory
import { DIRECTORY_PROVIDER_FACTORY } from './domain/ports/directory-provider.factory.port'
import { DirectoryProviderFactory } from './infrastructure/providers/directory-provider.factory'

// Command handlers
import { ConfigureIdentityProviderHandler } from './application/commands/configure-identity-provider.handler'
import { UpdateIdpGroupMappingHandler } from './application/commands/update-idp-group-mapping.handler'
import { SyncIdpGroupsHandler } from './application/commands/sync-idp-groups.handler'
import { UpsertGroupMappingHandler } from './application/commands/upsert-group-mapping.handler'
import { RemoveGroupMappingHandler } from './application/commands/remove-group-mapping.handler'
import { RequestMagicLinkHandler } from './application/commands/request-magic-link.handler'
import { ValidateMagicLinkHandler } from './application/commands/validate-magic-link.handler'
import { CreateApiKeyHandler } from './application/commands/create-api-key.handler'
import { RunDirectorySyncHandler } from './application/commands/run-directory-sync.handler'
import { TestIdpConnectionHandler } from './application/commands/test-idp-connection.handler'
import { InviteLocalUserHandler } from './application/commands/invite-local-user.handler'
import { DeactivateLocalUserHandler } from './application/commands/deactivate-local-user.handler'

// Query handlers
import { GetIdentityProviderHandler } from './application/queries/get-identity-provider.handler'
import { GetIdpGroupMappingsHandler } from './application/queries/get-idp-group-mappings.handler'
import { ListGroupMappingsHandler } from './application/queries/list-group-mappings.handler'
import { GetSyncStatusHandler } from './application/queries/get-sync-status.handler'
import { GetSyncHistoryHandler } from './application/queries/get-sync-history.handler'
import { ValidateApiKeyHandler } from './application/queries/validate-api-key.handler'
import { ListLocalUsersHandler } from './application/queries/list-local-users.handler'

import { TriggerDirectorySyncHandler } from './application/commands/trigger-directory-sync.handler'

// Sync monitoring ports
import { JOB_SCHEDULER } from './domain/ports/job-scheduler.port'
import { SYNC_HISTORY_REPOSITORY } from './domain/repositories/sync-history.repository.port'

// Facade
import { IdentityQueryFacade } from './application/facades/identity-query.facade'

// tRPC interface
import { IdentityTrpcService } from './interface/trpc/identity-trpc.service'

@Module({
  imports: [CqrsModule, KernelModule],
  providers: [
    // Repositories
    { provide: IDENTITY_PROVIDER_REPOSITORY, useClass: DrizzleIdentityProviderRepository },
    { provide: IDP_GROUP_MAPPING_REPOSITORY, useClass: DrizzleIdpGroupMappingRepository },
    { provide: MAGIC_LINK_TOKEN_REPOSITORY, useClass: DrizzleMagicLinkTokenRepository },
    { provide: API_KEY_REPOSITORY, useClass: DrizzleApiKeyRepository },
    // Stub repositories (until real Drizzle repos are built)
    {
      provide: SYNC_HISTORY_REPOSITORY,
      useValue: { findLatestByTenantId: async () => [], insert: async (d: unknown) => d },
    },
    // Providers
    { provide: DIRECTORY_PROVIDER_FACTORY, useClass: DirectoryProviderFactory },
    { provide: MAGIC_LINK_SENDER, useClass: MagicLinkSenderStub },
    { provide: LOCAL_USER_QUERY_PORT, useClass: LocalUserQueryStub },
    // Stub ports (until real implementations are built)
    {
      provide: JOB_SCHEDULER,
      useValue: {
        enqueueDirectorySync: async () => 'stub-job',
        getNextScheduledSync: async () => null,
      },
    },
    // Command handlers
    ConfigureIdentityProviderHandler,
    UpdateIdpGroupMappingHandler,
    SyncIdpGroupsHandler,
    UpsertGroupMappingHandler,
    RemoveGroupMappingHandler,
    RequestMagicLinkHandler,
    ValidateMagicLinkHandler,
    CreateApiKeyHandler,
    RunDirectorySyncHandler,
    TestIdpConnectionHandler,
    InviteLocalUserHandler,
    DeactivateLocalUserHandler,
    TriggerDirectorySyncHandler,
    // Query handlers
    GetIdentityProviderHandler,
    GetIdpGroupMappingsHandler,
    ListGroupMappingsHandler,
    GetSyncStatusHandler,
    GetSyncHistoryHandler,
    ValidateApiKeyHandler,
    ListLocalUsersHandler,
    // Facade
    IdentityQueryFacade,
    // tRPC interface
    IdentityTrpcService,
  ],
  exports: [IdentityQueryFacade],
})
export class IdentityModule {}
