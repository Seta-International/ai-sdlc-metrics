export class UnlinkRosterCommand {
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly msRosterId: string,
  ) {}
}
