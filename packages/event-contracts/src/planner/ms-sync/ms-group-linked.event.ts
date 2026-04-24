export const MS_GROUP_LINKED_EVENT = 'planner.ms_sync.group_linked'

export interface MsGroupLinkedEvent {
  readonly type: typeof MS_GROUP_LINKED_EVENT
  readonly tenantId: string
  readonly msGroupId: string
  readonly actorId: string
  readonly occurredAt: string
}

export function createMsGroupLinkedEvent(
  input: Omit<MsGroupLinkedEvent, 'type'>,
): MsGroupLinkedEvent {
  return { type: MS_GROUP_LINKED_EVENT, ...input }
}
