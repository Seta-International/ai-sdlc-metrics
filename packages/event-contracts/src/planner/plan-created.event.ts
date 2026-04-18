export class PlanCreatedEvent {
  static readonly eventName = 'planner.plan-created'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly planId: string,
    public readonly name: string,
  ) {}
}
