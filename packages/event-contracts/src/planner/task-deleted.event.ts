import type { EventOrigin } from './ms-sync/field-names'

export class TaskDeletedEvent {
  static readonly eventName = 'planner.task-deleted'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly taskId: string,
    public readonly deletedAt: string,
    public readonly changedFields: readonly string[],
    public readonly origin: EventOrigin,
  ) {}
}
