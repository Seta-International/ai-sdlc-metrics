export class ReorderChecklistItemCommand {
  constructor(
    public readonly tenantId: string,
    public readonly planId: string,
    public readonly taskId: string,
    public readonly itemId: string,
    public readonly actorId: string,
    public readonly orderHintAfter?: string,
    public readonly orderHintBefore?: string,
  ) {}
}
