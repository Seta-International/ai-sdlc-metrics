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
import { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'

@Injectable()
export class IdentityQueryFacade {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly kernelQueryFacade: KernelQueryFacade,
  ) {}

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

  /**
   * Returns the external user ID (SSO subject / AAD OID) for the given actor.
   * Returns null if no user identity exists for that actor in the tenant.
   */
  getExternalUserId(actorId: string, tenantId: string): Promise<string | null> {
    return this.kernelQueryFacade.getExternalUserId(actorId, tenantId)
  }

  /**
   * Returns the actorId for the given AAD user ID (OID) within a tenant.
   * Returns null if no matching user identity is found.
   */
  async getActorIdByExternalUserId(aadUserId: string, tenantId: string): Promise<string | null> {
    const identity = await this.kernelQueryFacade.getUserIdentityBySsoSubject(aadUserId, tenantId)
    return identity?.actorId ?? null
  }
}
