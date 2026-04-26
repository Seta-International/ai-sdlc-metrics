import type { EventOrigin } from './ms-sync/field-names'

export class TaskLabelRemovedEvent {
  static readonly eventName = 'planner.task-label-removed'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly taskId: string,
    public readonly planId: string,
    public readonly slot: string,
    public readonly changedFields: readonly string[],
    public readonly origin: EventOrigin,
  ) {}
}
