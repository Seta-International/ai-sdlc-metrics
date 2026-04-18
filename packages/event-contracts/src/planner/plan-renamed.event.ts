export class PlanRenamedEvent {
  static readonly eventName = 'planner.plan-renamed'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly planId: string,
    public readonly name: string,
  ) {}
}
