export const MS_ROSTER_MINTED_EVENT = 'planner.ms_sync.roster_minted'

export interface MsRosterMintedEvent {
  readonly type: typeof MS_ROSTER_MINTED_EVENT
  readonly tenantId: string
  readonly msRosterId: string
  readonly actorId: string
  readonly occurredAt: string
}

export function createMsRosterMintedEvent(
  input: Omit<MsRosterMintedEvent, 'type'>,
): MsRosterMintedEvent {
  return { type: MS_ROSTER_MINTED_EVENT, ...input }
}
