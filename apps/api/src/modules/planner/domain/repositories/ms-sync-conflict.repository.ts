import type { MsSyncConflictEntity } from '../entities/ms-sync-conflict.entity'

export const MS_SYNC_CONFLICT_REPOSITORY = Symbol('IMsSyncConflictRepository')

export interface IMsSyncConflictRepository {
  insert(entity: MsSyncConflictEntity): Promise<void>
  get(id: string, tenantId?: string): Promise<MsSyncConflictEntity | null>
  list(
    tenantId: string,
    opts: { resolved: 'open' | 'all'; limit: number; before?: Date },
  ): Promise<MsSyncConflictEntity[]>
  markResolved(id: string, actorId: string, resolution: string): Promise<void>
}
