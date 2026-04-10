export class TaskCompletedEvent {
  static readonly eventName = 'planner.task-completed'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly taskId: string,
    public readonly completedAt: string,
  ) {}
}
