export class ChecklistItemToggledEvent {
  static readonly eventName = 'planner.checklist-item-toggled'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly taskId: string,
    public readonly itemId: string,
    public readonly isChecked: boolean,
  ) {}
}
