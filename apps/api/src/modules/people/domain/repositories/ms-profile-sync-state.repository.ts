import type { MsProfileSyncState } from '../entities/ms-profile-sync-state.entity'

export const MS_PROFILE_SYNC_STATE_REPOSITORY = 'MS_PROFILE_SYNC_STATE_REPOSITORY'

export interface IMsProfileSyncStateRepository {
  findByTenantId(tenantId: string): Promise<MsProfileSyncState | null>
  upsert(tenantId: string, deltaToken: string | null, lastSyncedAt: Date): Promise<void>
  clearDeltaToken(tenantId: string): Promise<void>
}
