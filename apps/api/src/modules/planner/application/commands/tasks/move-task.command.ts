export class MoveTaskCommand {
  constructor(
    public readonly tenantId: string,
    public readonly planId: string,
    public readonly taskId: string,
    public readonly actorId: string,
    public readonly expectedVersion: string,
    public readonly toBucketId: string,
    public readonly orderHintAfter?: string,
    public readonly orderHintBefore?: string,
  ) {}
}
