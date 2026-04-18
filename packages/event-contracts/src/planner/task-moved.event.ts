export class TaskMovedEvent {
  static readonly eventName = 'planner.task-moved'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly taskId: string,
    public readonly planId: string,
    public readonly toBucketId: string,
    public readonly orderHint: string,
  ) {}
}
