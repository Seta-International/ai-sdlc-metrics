export class PlanLabelUpdatedEvent {
  static readonly eventName = 'planner.plan-label-updated'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly planId: string,
    public readonly slot: string,
  ) {}
}
