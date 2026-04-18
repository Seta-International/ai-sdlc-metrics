export class SetTaskPriorityCommand {
  constructor(
    public readonly tenantId: string,
    public readonly planId: string,
    public readonly taskId: string,
    public readonly actorId: string,
    public readonly expectedVersion: string,
    public readonly priority: 1 | 3 | 5 | 9,
  ) {}
}
