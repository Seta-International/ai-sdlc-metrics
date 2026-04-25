export const MS_SYNC_BACKFILL_PROGRESS_EVENT = 'planner.ms_sync.backfill_progress'

export interface MsSyncBackfillProgressEvent {
  readonly type: typeof MS_SYNC_BACKFILL_PROGRESS_EVENT
  readonly jobId: string
  readonly tenantId: string
  readonly msGroupId: string
  readonly total: number
  readonly processed: number
  readonly occurredAt: string
}

export function createBackfillProgressEvent(
  input: Omit<MsSyncBackfillProgressEvent, 'type'>,
): MsSyncBackfillProgressEvent {
  return { type: MS_SYNC_BACKFILL_PROGRESS_EVENT, ...input }
}
