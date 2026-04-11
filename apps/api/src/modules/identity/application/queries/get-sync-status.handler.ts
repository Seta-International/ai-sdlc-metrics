import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  IDENTITY_PROVIDER_REPOSITORY,
  type IIdentityProviderRepository,
} from '../../domain/repositories/identity-provider.repository'
import type { IdpSyncStatus } from '../../domain/entities/identity-provider.entity'
import { GetSyncStatusQuery } from './get-sync-status.query'

export interface SyncStatusResult {
  syncStatus: IdpSyncStatus | null
  lastSyncAt: Date | null
}

@QueryHandler(GetSyncStatusQuery)
export class GetSyncStatusHandler implements IQueryHandler<GetSyncStatusQuery, SyncStatusResult> {
  constructor(
    @Inject(IDENTITY_PROVIDER_REPOSITORY)
    private readonly providerRepo: IIdentityProviderRepository,
  ) {}

  async execute(query: GetSyncStatusQuery): Promise<SyncStatusResult> {
    const provider = await this.providerRepo.findPrimary(query.tenantId)
    if (!provider) {
      return { syncStatus: null, lastSyncAt: null }
    }
    return { syncStatus: provider.syncStatus, lastSyncAt: provider.lastSyncAt }
  }
}
