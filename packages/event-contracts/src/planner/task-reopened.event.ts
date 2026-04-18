export class TaskReopenedEvent {
  static readonly eventName = 'planner.task-reopened'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly taskId: string,
    public readonly planId: string,
  ) {}
}
