export const MS_SYNC_ENABLED_EVENT = 'planner.ms_sync.enabled'

export interface MsSyncEnabledEvent {
  readonly type: typeof MS_SYNC_ENABLED_EVENT
  readonly tenantId: string
  readonly actorId: string
  readonly tenantAdId: string
  readonly clientId: string
  readonly occurredAt: string
}

export function createMsSyncEnabledEvent(
  input: Omit<MsSyncEnabledEvent, 'type'>,
): MsSyncEnabledEvent {
  return { type: MS_SYNC_ENABLED_EVENT, ...input }
}
