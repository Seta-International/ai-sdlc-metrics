import type { MsPlanSyncStateEntity } from '../entities/ms-plan-sync-state.entity'

export const MS_PLAN_SYNC_STATE_REPOSITORY = Symbol('IMsPlanSyncStateRepository')

export interface IMsPlanSyncStateRepository {
  get(planId: string): Promise<MsPlanSyncStateEntity | null>
  findByMsPlanId(tenantId: string, msPlanId: string): Promise<MsPlanSyncStateEntity | null>
  upsertState(entity: MsPlanSyncStateEntity): Promise<void>
  listForTenant(tenantId: string): Promise<MsPlanSyncStateEntity[]>
  /** Returns states whose pollPausedUntil has elapsed — ready to resume polling. */
  listPausable(tenantId: string): Promise<MsPlanSyncStateEntity[]>
}
