export class RetryConflictCommand {
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly conflictId: string,
  ) {}
}
