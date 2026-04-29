import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  MS_LINKED_GROUP_REPOSITORY,
  type IMsLinkedGroupRepository,
} from '../../../domain/repositories/ms-linked-group.repository'
import {
  MS_SYNC_CONFLICT_REPOSITORY,
  type IMsSyncConflictRepository,
} from '../../../domain/repositories/ms-sync-conflict.repository'
import { GetTenantSyncHealthQuery } from './get-tenant-sync-health.query'

export interface TenantSyncHealthDto {
  tenantId: string
  linkedGroups: number
  openConflicts: number
  status: 'active' | 'disconnected'
}

@QueryHandler(GetTenantSyncHealthQuery)
export class GetTenantSyncHealthHandler implements IQueryHandler<
  GetTenantSyncHealthQuery,
  TenantSyncHealthDto[]
> {
  constructor(
    @Inject(MS_LINKED_GROUP_REPOSITORY)
    private readonly groupRepo: IMsLinkedGroupRepository,
    @Inject(MS_SYNC_CONFLICT_REPOSITORY)
    private readonly conflictRepo: IMsSyncConflictRepository,
  ) {}

  async execute(_query: GetTenantSyncHealthQuery): Promise<TenantSyncHealthDto[]> {
    const tenantIds = await this.groupRepo.listDistinctActiveTenantIds()

    const results: TenantSyncHealthDto[] = []

    for (const tenantId of tenantIds) {
      const groups = await this.groupRepo.listActiveForTenant(tenantId)
      const openConflictRows = await this.conflictRepo.list(tenantId, {
        resolved: 'open',
        limit: 200,
      })

      results.push({
        tenantId,
        linkedGroups: groups.length,
        openConflicts: openConflictRows.length,
        status: groups.length > 0 ? 'active' : 'disconnected',
      })
    }

    return results
  }
}
