export class PushAttachmentCommand {
  constructor(
    public readonly attachmentId: string,
    public readonly tenantId: string,
  ) {}
}
