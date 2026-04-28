import type { EventOrigin } from './ms-sync/field-names'

export class PlanCreatedEvent {
  static readonly eventName = 'planner.plan-created'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly planId: string,
    public readonly name: string,
    public readonly changedFields: readonly string[],
    public readonly origin: EventOrigin,
  ) {}
}
