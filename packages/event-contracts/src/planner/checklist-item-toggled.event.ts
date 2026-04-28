import type { EventOrigin } from './ms-sync/field-names'

export class ChecklistItemToggledEvent {
  static readonly eventName = 'planner.checklist-item-toggled'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly taskId: string,
    public readonly itemId: string,
    public readonly isChecked: boolean,
    public readonly changedFields: readonly string[],
    public readonly origin: EventOrigin,
  ) {}
}
