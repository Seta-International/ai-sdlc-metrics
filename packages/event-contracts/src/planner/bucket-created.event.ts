export class BucketCreatedEvent {
  static readonly eventName = 'planner.bucket-created'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly planId: string,
    public readonly bucketId: string,
    public readonly name: string,
    public readonly orderHint: string,
  ) {}
}
