import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  SYNC_HISTORY_REPOSITORY,
  type ISyncHistoryRepository,
} from '../../domain/repositories/sync-history.repository'
import type { SyncHistory } from '../../domain/entities/sync-history.entity'
import { GetSyncHistoryQuery } from './get-sync-history.query'

@QueryHandler(GetSyncHistoryQuery)
export class GetSyncHistoryHandler implements IQueryHandler<GetSyncHistoryQuery, SyncHistory[]> {
  constructor(
    @Inject(SYNC_HISTORY_REPOSITORY)
    private readonly syncHistoryRepo: ISyncHistoryRepository,
  ) {}

  async execute(query: GetSyncHistoryQuery): Promise<SyncHistory[]> {
    return this.syncHistoryRepo.findLatestByTenantId(query.tenantId, query.limit)
  }
}
