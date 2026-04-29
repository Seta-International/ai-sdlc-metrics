export class LinkExistingRosterCommand {
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly msRosterId: string,
    public readonly displayName: string | null,
  ) {}
}
