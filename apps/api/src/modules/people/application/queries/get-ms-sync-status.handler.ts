import { Inject } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import {
  MS_PROFILE_SYNC_STATE_REPOSITORY,
  type IMsProfileSyncStateRepository,
} from '../../domain/repositories/ms-profile-sync-state.repository'
import {
  MS_STAGED_USER_REPOSITORY,
  type IMsStagedUserRepository,
} from '../../domain/repositories/ms-staged-user.repository'
import { IdentityQueryFacade } from '../../../identity/application/facades/identity-query.facade'
import { GetMsSyncStatusQuery } from './get-ms-sync-status.query'

export interface MsSyncStatusDto {
  connected: boolean
  lastSyncedAt: string | null
  pendingCount: number
  importedCount: number
  skippedCount: number
}

@QueryHandler(GetMsSyncStatusQuery)
export class GetMsSyncStatusHandler implements IQueryHandler<
  GetMsSyncStatusQuery,
  MsSyncStatusDto
> {
  constructor(
    @Inject(MS_PROFILE_SYNC_STATE_REPOSITORY)
    private readonly syncStateRepo: IMsProfileSyncStateRepository,
    @Inject(MS_STAGED_USER_REPOSITORY)
    private readonly stagedUserRepo: IMsStagedUserRepository,
    private readonly identityFacade: IdentityQueryFacade,
  ) {}

  async execute(query: GetMsSyncStatusQuery): Promise<MsSyncStatusDto> {
    const credential = await this.identityFacade.getGraphCredential(query.tenantId)
    const syncState = await this.syncStateRepo.findByTenantId(query.tenantId)
    const pendingCount = await this.stagedUserRepo.countByStatus(query.tenantId, 'pending')
    const importedCount = await this.stagedUserRepo.countByStatus(query.tenantId, 'imported')
    const skippedCount = await this.stagedUserRepo.countByStatus(query.tenantId, 'skipped')

    return {
      connected: credential?.status === 'active',
      lastSyncedAt: syncState?.lastSyncedAt?.toISOString() ?? null,
      pendingCount,
      importedCount,
      skippedCount,
    }
  }
}
