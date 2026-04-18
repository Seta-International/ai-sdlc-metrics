export class RemoveLabelCommand {
  constructor(
    public readonly tenantId: string,
    public readonly planId: string,
    public readonly taskId: string,
    public readonly actorId: string,
    public readonly expectedVersion: string,
    public readonly slot: string,
  ) {}
}
