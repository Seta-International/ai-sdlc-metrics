export const MS_SYNC_CREDENTIAL_INVALIDATED_EVENT = 'planner.ms_sync.credential_invalidated'

export interface MsSyncCredentialInvalidatedEvent {
  readonly type: typeof MS_SYNC_CREDENTIAL_INVALIDATED_EVENT
  readonly tenantId: string
  readonly reason: string
  readonly occurredAt: string
}

export function createMsSyncCredentialInvalidatedEvent(
  input: Omit<MsSyncCredentialInvalidatedEvent, 'type'>,
): MsSyncCredentialInvalidatedEvent {
  return { type: MS_SYNC_CREDENTIAL_INVALIDATED_EVENT, ...input }
}
