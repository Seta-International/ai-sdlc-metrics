export class TaskCustomFieldUpdatedEvent {
  static readonly eventName = 'planner.task-custom-field-updated'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly taskId: string,
    public readonly planId: string,
    public readonly fieldDefId: string,
    public readonly fieldName: string,
  ) {}
}
