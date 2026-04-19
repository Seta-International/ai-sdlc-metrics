export class RemoveAttachmentCommand {
  constructor(
    public readonly tenantId: string,
    public readonly planId: string,
    public readonly taskId: string,
    public readonly attachmentId: string,
    public readonly actorId: string,
    public readonly expectedVersion: string,
  ) {}
}
