import type { EventOrigin } from './ms-sync/field-names'

export class PlanDeletedEvent {
  static readonly eventName = 'planner.plan-deleted'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly planId: string,
    public readonly changedFields: readonly string[],
    public readonly origin: EventOrigin,
  ) {}
}
