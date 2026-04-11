import type { SyncHistory } from '../entities/sync-history.entity'

export const SYNC_HISTORY_REPOSITORY = Symbol('ISyncHistoryRepository')

export interface ISyncHistoryRepository {
  findLatestByTenantId(tenantId: string, limit: number): Promise<SyncHistory[]>
  insert(data: {
    tenantId: string
    identityProviderId: string
    status: SyncHistory['status']
    usersCreated: number
    usersDeactivated: number
    rolesChanged: number
    errorMessage: string | null
    startedAt: Date
    completedAt: Date
  }): Promise<SyncHistory>
}
