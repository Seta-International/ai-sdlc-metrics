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
    const entity = await this.providerRepo.findPrimary(query.tenantId)
    if (!entity) return null

    return {
      id: entity.id,
      providerType: entity.providerType,
      displayName: entity.displayName,
      clientId: entity.clientId,
      directoryId: entity.directoryId,
      isPrimary: entity.isPrimary,
      syncEnabled: entity.syncEnabled,
      lastSyncAt: entity.lastSyncAt ? entity.lastSyncAt.toISOString() : null,
      syncStatus: entity.syncStatus,
    }
  }
}
