export class BucketDeletedEvent {
  static readonly eventName = 'planner.bucket-deleted'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly planId: string,
    public readonly bucketId: string,
    public readonly deletedAt: string,
  ) {}
}
