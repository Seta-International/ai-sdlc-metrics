export class ForceResyncTaskCommand {
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly taskId: string,
  ) {}
}
