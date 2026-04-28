export class PullAttachmentCommand {
  constructor(
    public readonly attachmentId: string,
    public readonly tenantId: string,
  ) {}
}
