import { Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import type { IdentityProviderEntity } from '../../domain/entities/identity-provider.entity'
import type { IdpGroupMapping } from '../../domain/entities/idp-group-mapping.entity'
import { GetIdentityProviderQuery } from '../queries/get-identity-provider.query'
import { GetIdpGroupMappingsQuery } from '../queries/get-idp-group-mappings.query'
import { GetSyncStatusQuery } from '../queries/get-sync-status.query'
import { ValidateApiKeyQuery } from '../queries/validate-api-key.query'
import type { SyncStatusDto as SyncStatusResult } from '../queries/get-sync-status.handler'
import type { ValidateApiKeyResult } from '../queries/validate-api-key.handler'

@Injectable()
export class IdentityQueryFacade {
  constructor(private readonly queryBus: QueryBus) {}

  getIdentityProvider(tenantId: string): Promise<IdentityProviderEntity | null> {
    return this.queryBus.execute(new GetIdentityProviderQuery(tenantId))
  }

  getIdpGroupMappings(tenantId: string): Promise<IdpGroupMapping[]> {
    return this.queryBus.execute(new GetIdpGroupMappingsQuery(tenantId))
  }

  getSyncStatus(tenantId: string): Promise<SyncStatusResult> {
    return this.queryBus.execute(new GetSyncStatusQuery(tenantId))
  }

  validateApiKey(keyHash: string, tenantId: string): Promise<ValidateApiKeyResult> {
    return this.queryBus.execute(new ValidateApiKeyQuery(keyHash, tenantId))
  }
}
