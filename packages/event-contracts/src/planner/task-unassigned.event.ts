import type { EventOrigin } from './ms-sync/field-names'

export class TaskUnassignedEvent {
  static readonly eventName = 'planner.task-unassigned'
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
