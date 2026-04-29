export class MintMsRosterCommand {
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly displayName: string,
    public readonly initialMemberActorIds: string[],
  ) {}
}
