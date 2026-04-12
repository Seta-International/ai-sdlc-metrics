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
import { UpdateIdpGroupMappingHandler } from './application/commands/update-idp-group-mapping.handler'
import { RequestMagicLinkHandler } from './application/commands/request-magic-link.handler'
import { ValidateMagicLinkHandler } from './application/commands/validate-magic-link.handler'
import { CreateApiKeyHandler } from './application/commands/create-api-key.handler'
import { RunDirectorySyncHandler } from './application/commands/run-directory-sync.handler'

import { GetIdentityProviderHandler } from './application/queries/get-identity-provider.handler'
import { GetIdpGroupMappingsHandler } from './application/queries/get-idp-group-mappings.handler'
import { GetSyncStatusHandler } from './application/queries/get-sync-status.handler'
import { ValidateApiKeyHandler } from './application/queries/validate-api-key.handler'

import { IdentityQueryFacade } from './application/facades/identity-query.facade'

@Module({
  imports: [CqrsModule, KernelModule],
  providers: [
    { provide: IDENTITY_PROVIDER_REPOSITORY, useClass: DrizzleIdentityProviderRepository },
    { provide: IDP_GROUP_MAPPING_REPOSITORY, useClass: DrizzleIdpGroupMappingRepository },
    { provide: MAGIC_LINK_TOKEN_REPOSITORY, useClass: DrizzleMagicLinkTokenRepository },
    { provide: API_KEY_REPOSITORY, useClass: DrizzleApiKeyRepository },
    { provide: DIRECTORY_PROVIDER_FACTORY, useClass: DirectoryProviderFactory },
    ConfigureIdentityProviderHandler,
    UpdateIdpGroupMappingHandler,
    RequestMagicLinkHandler,
    ValidateMagicLinkHandler,
    CreateApiKeyHandler,
    RunDirectorySyncHandler,
    GetIdentityProviderHandler,
    GetIdpGroupMappingsHandler,
    GetSyncStatusHandler,
    ValidateApiKeyHandler,
    IdentityQueryFacade,
  ],
  exports: [IdentityQueryFacade],
})
export class IdentityModule {}
