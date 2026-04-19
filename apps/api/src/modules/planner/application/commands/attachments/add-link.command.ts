export class AddLinkCommand {
  constructor(
    public readonly tenantId: string,
    public readonly planId: string,
    public readonly taskId: string,
    public readonly attachmentId: string,
    public readonly actorId: string,
    public readonly url: string,
    public readonly linkTitle?: string,
  ) {}
}
