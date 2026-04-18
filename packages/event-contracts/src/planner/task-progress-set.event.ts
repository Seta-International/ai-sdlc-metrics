export class TaskProgressSetEvent {
  static readonly eventName = 'planner.task-progress-set'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly taskId: string,
    public readonly planId: string,
    public readonly progress: 0 | 50 | 100,
  ) {}
}
