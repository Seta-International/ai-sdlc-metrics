import type { EventOrigin } from './ms-sync/field-names'

export class ChecklistItemUpdatedEvent {
  static readonly eventName = 'planner.checklist-item-updated'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly taskId: string,
    public readonly itemId: string,
    public readonly title: string,
    public readonly changedFields: readonly string[],
    public readonly origin: EventOrigin,
  ) {}
}
