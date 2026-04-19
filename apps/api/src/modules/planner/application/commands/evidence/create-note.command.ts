export class CreateEvidenceNoteCommand {
  constructor(
    public readonly tenantId: string,
    public readonly planId: string,
    public readonly taskId: string,
    public readonly evidenceId: string,
    public readonly actorId: string,
    public readonly caption: string,
    public readonly body: string,
  ) {}
}
