export class FinalizeUploadCommand {
  constructor(
    public readonly tenantId: string,
    public readonly planId: string,
    public readonly taskId: string,
    public readonly attachmentId: string,
    public readonly actorId: string,
    public readonly storageKey: string,
    public readonly filename: string,
    public readonly contentType: string,
    public readonly sizeBytes: number,
    public readonly setAsCover?: boolean,
  ) {}
}
