export class AddPlanMemberCommand {
  constructor(
    public readonly tenantId: string,
    public readonly planId: string,
    public readonly actorId: string,
    public readonly targetActorId: string,
    public readonly role: 'owner' | 'editor' | 'viewer',
  ) {}
}
