import type { EventOrigin } from './ms-sync/field-names'

export class ChecklistItemReorderedEvent {
  static readonly eventName = 'planner.checklist-item-reordered'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly taskId: string,
    public readonly itemId: string,
    public readonly orderHint: string,
    public readonly changedFields: readonly string[],
    public readonly origin: EventOrigin,
  ) {}
}
