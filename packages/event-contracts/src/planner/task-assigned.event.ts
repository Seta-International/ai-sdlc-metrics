import type { EventOrigin } from './ms-sync/field-names'

export class TaskAssignedEvent {
  static readonly eventName = 'planner.task-assigned'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly taskId: string,
    public readonly planId: string,
    public readonly assigneeId: string,
    public readonly changedFields: readonly string[],
    public readonly origin: EventOrigin,
  ) {}
}
