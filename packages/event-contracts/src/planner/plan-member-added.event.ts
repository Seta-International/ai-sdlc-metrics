export class PlanMemberAddedEvent {
  static readonly eventName = 'planner.plan-member-added'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly planId: string,
    public readonly targetActorId: string,
    public readonly role: 'owner' | 'editor' | 'viewer',
  ) {}
}
