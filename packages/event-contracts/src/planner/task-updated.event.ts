export class TaskUpdatedEvent {
  static readonly eventName = 'planner.task-updated'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly taskId: string,
    public readonly planId: string,
  ) {}
}
