export class TaskUnassignedEvent {
  static readonly eventName = 'planner.task-unassigned'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly taskId: string,
    public readonly planId: string,
    public readonly assigneeId: string,
  ) {}
}
