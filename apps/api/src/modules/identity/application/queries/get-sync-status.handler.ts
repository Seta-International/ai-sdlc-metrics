import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  IDENTITY_PROVIDER_REPOSITORY,
  type IIdentityProviderRepository,
} from '../../domain/repositories/identity-provider.repository.port'
import {
  SYNC_HISTORY_REPOSITORY,
  type ISyncHistoryRepository,
} from '../../domain/repositories/sync-history.repository.port'
import { JOB_SCHEDULER, type IJobScheduler } from '../../domain/ports/job-scheduler.port'
import { GetSyncStatusQuery } from './get-sync-status.query'

export interface SyncStatusDto {
  syncEnabled: boolean
  syncStatus: string | null
  lastSyncAt: string | null
  nextScheduledAt: string | null
  lastSyncStats: {
    usersCreated: number
    usersDeactivated: number
    rolesChanged: number
    status: string
    errorMessage: string | null
  } | null
}

@QueryHandler(GetSyncStatusQuery)
export class GetSyncStatusHandler implements IQueryHandler<GetSyncStatusQuery, SyncStatusDto> {
  constructor(
    @Inject(IDENTITY_PROVIDER_REPOSITORY)
    private readonly providerRepo: IIdentityProviderRepository,
    @Inject(SYNC_HISTORY_REPOSITORY)
    private readonly syncHistoryRepo: ISyncHistoryRepository,
    @Inject(JOB_SCHEDULER)
    private readonly jobScheduler: IJobScheduler,
  ) {}

  async execute(query: GetSyncStatusQuery): Promise<SyncStatusDto> {
    const provider = await this.providerRepo.findPrimaryByTenantId(query.tenantId)

    if (!provider) {
      return {
        syncEnabled: false,
        syncStatus: null,
        lastSyncAt: null,
        nextScheduledAt: null,
        lastSyncStats: null,
      }
    }

    const history = await this.syncHistoryRepo.findLatestByTenantId(query.tenantId, 1)
    const lastSync = history[0] ?? null
    const nextScheduled = await this.jobScheduler.getNextScheduledSync(query.tenantId)

    return {
      syncEnabled: provider.syncEnabled,
      syncStatus: provider.syncStatus,
      lastSyncAt: provider.lastSyncAt?.toISOString() ?? null,
      nextScheduledAt: nextScheduled?.toISOString() ?? null,
      lastSyncStats: lastSync
        ? {
            usersCreated: lastSync.usersCreated,
            usersDeactivated: lastSync.usersDeactivated,
            rolesChanged: lastSync.rolesChanged,
            status: lastSync.status,
            errorMessage: lastSync.errorMessage,
          }
        : null,
    }
  }
}
