export class RequestEvidenceUploadCommand {
  constructor(
    public readonly tenantId: string,
    public readonly planId: string,
    public readonly taskId: string,
    public readonly actorId: string,
    public readonly filename: string,
    public readonly contentType: string,
    public readonly sizeBytes: number,
  ) {}
}
