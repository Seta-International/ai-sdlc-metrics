export class ChecklistItemAddedEvent {
  static readonly eventName = 'planner.checklist-item-added'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly taskId: string,
    public readonly itemId: string,
    public readonly title: string,
  ) {}
}
