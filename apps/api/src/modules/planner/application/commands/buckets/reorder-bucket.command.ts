export class ReorderBucketCommand {
  constructor(
    public readonly tenantId: string,
    public readonly planId: string,
    public readonly bucketId: string,
    public readonly actorId: string,
    public readonly orderHintAfter: string | undefined,
    public readonly orderHintBefore: string | undefined,
  ) {}
}
