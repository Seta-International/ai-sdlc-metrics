import type { MsPlanSyncStateEntity } from '../entities/ms-plan-sync-state.entity'

export const MS_PLAN_SYNC_STATE_REPOSITORY = Symbol('IMsPlanSyncStateRepository')

export interface IMsPlanSyncStateRepository {
  get(planId: string): Promise<MsPlanSyncStateEntity | null>
  findByMsPlanId(tenantId: string, msPlanId: string): Promise<MsPlanSyncStateEntity | null>
  upsertState(entity: MsPlanSyncStateEntity): Promise<void>
  listForTenant(tenantId: string): Promise<MsPlanSyncStateEntity[]>
  /** Returns states whose pollPausedUntil has elapsed — ready to resume polling. */
  listPausable(tenantId: string): Promise<MsPlanSyncStateEntity[]>
  removeAllForTenant(tenantId: string): Promise<void>
  /** Sets pollPausedUntil on all sync states for plans belonging to the given linked group. */
  pauseAllPlansForGroup(tenantId: string, groupId: string, until: Date): Promise<void>
  /** Increments consecutiveErrorCount on all sync states for plans belonging to the given linked group. */
  incrementErrorCountForGroup(tenantId: string, groupId: string, message: string): Promise<void>
  /** Returns the maximum consecutiveErrorCount across all sync states for plans in the given group. */
  maxConsecutiveErrorCountForGroup(tenantId: string, groupId: string): Promise<number>
}
