export class PlanMemberRemovedEvent {
  static readonly eventName = 'planner.plan-member-removed'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly planId: string,
    public readonly targetActorId: string,
  ) {}
}
