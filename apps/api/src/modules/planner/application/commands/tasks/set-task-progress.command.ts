export class SetTaskProgressCommand {
  constructor(
    public readonly tenantId: string,
    public readonly planId: string,
    public readonly taskId: string,
    public readonly actorId: string,
    public readonly expectedVersion: string,
    public readonly progress: 0 | 50 | 100,
  ) {}
}
