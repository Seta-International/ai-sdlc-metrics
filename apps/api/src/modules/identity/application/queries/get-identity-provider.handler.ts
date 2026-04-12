import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  IDENTITY_PROVIDER_REPOSITORY,
  type IIdentityProviderRepository,
} from '../../domain/repositories/identity-provider.repository'
import { GetIdentityProviderQuery } from './get-identity-provider.query'

export interface IdentityProviderDto {
  id: string
  providerType: string
  displayName: string
  clientId: string
  directoryId: string | null
  isPrimary: boolean
  syncEnabled: boolean
  lastSyncAt: string | null
  syncStatus: string
}

@QueryHandler(GetIdentityProviderQuery)
export class GetIdentityProviderHandler implements IQueryHandler<
  GetIdentityProviderQuery,
  IdentityProviderDto | null
> {
  constructor(
    @Inject(IDENTITY_PROVIDER_REPOSITORY)
    private readonly providerRepo: IIdentityProviderRepository,
  ) {}

  async execute(query: GetIdentityProviderQuery): Promise<IdentityProviderDto | null> {
    const provider = await this.providerRepo.findPrimaryByTenantId(query.tenantId)
    if (!provider) return null

    return {
      id: provider.id,
      providerType: provider.providerType,
      displayName: provider.displayName,
      clientId: provider.clientId,
      directoryId: provider.directoryId,
      isPrimary: provider.isPrimary,
      syncEnabled: provider.syncEnabled,
      lastSyncAt: provider.lastSyncAt?.toISOString() ?? null,
      syncStatus: provider.syncStatus,
    }
  }
}
