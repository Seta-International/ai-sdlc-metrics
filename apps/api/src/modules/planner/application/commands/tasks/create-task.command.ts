export class CreateTaskCommand {
  constructor(
    public readonly tenantId: string,
    public readonly planId: string,
    public readonly bucketId: string,
    public readonly taskId: string,
    public readonly title: string,
    public readonly actorId: string,
    public readonly description?: string,
    public readonly priority?: number,
    public readonly orderHintAfter?: string,
    public readonly orderHintBefore?: string,
  ) {}
}
