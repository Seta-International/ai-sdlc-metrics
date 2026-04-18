export class PlanDeletedEvent {
  static readonly eventName = 'planner.plan-deleted'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly planId: string,
  ) {}
}
