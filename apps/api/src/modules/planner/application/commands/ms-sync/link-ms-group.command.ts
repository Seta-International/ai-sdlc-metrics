export class LinkMsGroupCommand {
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly msGroupId: string,
  ) {}
}
