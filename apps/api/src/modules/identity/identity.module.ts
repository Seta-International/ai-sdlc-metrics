import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { KernelModule } from '../kernel/kernel.module'

import { IDENTITY_PROVIDER_REPOSITORY } from './domain/repositories/identity-provider.repository'
import { IDP_GROUP_MAPPING_REPOSITORY } from './domain/repositories/idp-group-mapping.repository'
import { MAGIC_LINK_TOKEN_REPOSITORY } from './domain/repositories/magic-link-token.repository'
import { API_KEY_REPOSITORY } from './domain/repositories/api-key.repository'

import { DrizzleIdentityProviderRepository } from './infrastructure/repositories/drizzle-identity-provider.repository'
import { DrizzleIdpGroupMappingRepository } from './infrastructure/repositories/drizzle-idp-group-mapping.repository'
import { DrizzleMagicLinkTokenRepository } from './infrastructure/repositories/drizzle-magic-link-token.repository'
import { DrizzleApiKeyRepository } from './infrastructure/repositories/drizzle-api-key.repository'

import { DIRECTORY_PROVIDER_FACTORY } from './infrastructure/providers/directory-provider.interface'
import { DirectoryProviderFactory } from './infrastructure/providers/directory-provider.factory'

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

import { IdentityQueryFacade } from './application/facades/identity-query.facade'

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
]

@Module({
  imports: [CqrsModule, KernelModule],
  providers: [
    { provide: IDENTITY_PROVIDER_REPOSITORY, useClass: DrizzleIdentityProviderRepository },
    { provide: IDP_GROUP_MAPPING_REPOSITORY, useClass: DrizzleIdpGroupMappingRepository },
    { provide: MAGIC_LINK_TOKEN_REPOSITORY, useClass: DrizzleMagicLinkTokenRepository },
    { provide: API_KEY_REPOSITORY, useClass: DrizzleApiKeyRepository },
    { provide: DIRECTORY_PROVIDER_FACTORY, useClass: DirectoryProviderFactory },
    ...CommandHandlers,
    ...QueryHandlers,
    IdentityQueryFacade,
  ],
  exports: [IdentityQueryFacade],
})
export class IdentityModule {}
