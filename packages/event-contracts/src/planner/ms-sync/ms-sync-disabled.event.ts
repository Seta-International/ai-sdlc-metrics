export const MS_SYNC_DISABLED_EVENT = 'planner.ms_sync.disabled'

export interface MsSyncDisabledEvent {
  readonly type: typeof MS_SYNC_DISABLED_EVENT
  readonly tenantId: string
  readonly actorId: string
  readonly reason: 'paused' | 'destroyed'
  readonly occurredAt: string
}

export function createMsSyncDisabledEvent(
  input: Omit<MsSyncDisabledEvent, 'type'>,
): MsSyncDisabledEvent {
  return { type: MS_SYNC_DISABLED_EVENT, ...input }
}
