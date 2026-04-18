export class BucketRenamedEvent {
  static readonly eventName = 'planner.bucket-renamed'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly planId: string,
    public readonly bucketId: string,
    public readonly name: string,
  ) {}
}
