export class ChecklistItemRemovedEvent {
  static readonly eventName = 'planner.checklist-item-removed'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly taskId: string,
    public readonly itemId: string,
  ) {}
}
