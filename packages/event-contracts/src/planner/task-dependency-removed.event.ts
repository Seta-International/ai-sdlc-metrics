export type DependencyKind = 'finish_to_start' | 'start_to_start' | 'finish_to_finish'

export class TaskDependencyRemovedEvent {
  static readonly eventName = 'planner.task-dependency-removed'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly taskId: string,
    public readonly planId: string,
    public readonly fromTaskId: string,
    public readonly toTaskId: string,
    public readonly kind: DependencyKind,
  ) {}
}
