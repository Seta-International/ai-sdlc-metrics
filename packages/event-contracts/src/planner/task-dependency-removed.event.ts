import type { DependencyKind } from './task-dependency-added.event'

export type { DependencyKind }

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
