export class UnassignTaskFromSprintCommand {
  constructor(
    public readonly tenantId: string,
    public readonly planId: string,
    public readonly actorId: string,
    public readonly taskId: string,
    public readonly expectedVersion: string,
  ) {}
}
