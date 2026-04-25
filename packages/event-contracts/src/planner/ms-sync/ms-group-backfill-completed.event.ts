export const MS_GROUP_BACKFILL_COMPLETED_EVENT = 'planner.ms_sync.group_backfill_completed'

export interface MsGroupBackfillCompletedEvent {
  readonly type: typeof MS_GROUP_BACKFILL_COMPLETED_EVENT
  readonly tenantId: string
  readonly msGroupId: string
  readonly linkedGroupId: string
  readonly totalPlans: number
  readonly occurredAt: string
}

export function createMsGroupBackfillCompletedEvent(
  input: Omit<MsGroupBackfillCompletedEvent, 'type'>,
): MsGroupBackfillCompletedEvent {
  return { type: MS_GROUP_BACKFILL_COMPLETED_EVENT, ...input }
}
