import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { KernelModule } from '../kernel/kernel.module'

// Repository symbols
import { IDENTITY_PROVIDER_REPOSITORY } from './domain/repositories/identity-provider.repository'
import { IDP_GROUP_MAPPING_REPOSITORY } from './domain/repositories/idp-group-mapping.repository'
import { MAGIC_LINK_TOKEN_REPOSITORY } from './domain/repositories/magic-link-token.repository'
import { API_KEY_REPOSITORY } from './domain/repositories/api-key.repository'

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
import { RequestMagicLinkHandler } from './application/commands/request-magic-link.handler'
import { ValidateMagicLinkHandler } from './application/commands/validate-magic-link.handler'
import { CreateApiKeyHandler } from './application/commands/create-api-key.handler'
import { RunDirectorySyncHandler } from './application/commands/run-directory-sync.handler'
import { TestIdpConnectionHandler } from './application/commands/test-idp-connection.handler'

// Query handlers
import { GetIdentityProviderHandler } from './application/queries/get-identity-provider.handler'
import { GetIdpGroupMappingsHandler } from './application/queries/get-idp-group-mappings.handler'
import { GetSyncStatusHandler } from './application/queries/get-sync-status.handler'
import { ValidateApiKeyHandler } from './application/queries/validate-api-key.handler'

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
    // Providers
    { provide: DIRECTORY_PROVIDER_FACTORY, useClass: DirectoryProviderFactory },
    // Command handlers
    ConfigureIdentityProviderHandler,
    UpdateIdpGroupMappingHandler,
    RequestMagicLinkHandler,
    ValidateMagicLinkHandler,
    CreateApiKeyHandler,
    RunDirectorySyncHandler,
    TestIdpConnectionHandler,
    // Query handlers
    GetIdentityProviderHandler,
    GetIdpGroupMappingsHandler,
    GetSyncStatusHandler,
    ValidateApiKeyHandler,
    // Facade
    IdentityQueryFacade,
    // tRPC interface
    IdentityTrpcService,
  ],
  exports: [IdentityQueryFacade],
})
export class IdentityModule {}
