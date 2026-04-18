export class TaskLabelRemovedEvent {
  static readonly eventName = 'planner.task-label-removed'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly taskId: string,
    public readonly planId: string,
    public readonly slot: string,
  ) {}
}
