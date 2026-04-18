export class TaskDeletedEvent {
  static readonly eventName = 'planner.task-deleted'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly taskId: string,
    public readonly deletedAt: string,
  ) {}
}
