import type { EventOrigin } from './ms-sync/field-names'

export class TaskCreatedEvent {
  static readonly eventName = 'planner.task-created'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly taskId: string,
    public readonly title: string,
    public readonly kpiId: string | null,
    public readonly dueDate: string | null,
    public readonly changedFields: readonly string[],
    public readonly origin: EventOrigin,
  ) {}
}
