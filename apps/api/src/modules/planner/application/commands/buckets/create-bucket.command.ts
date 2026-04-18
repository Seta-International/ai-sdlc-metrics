export class CreateBucketCommand {
  constructor(
    public readonly tenantId: string,
    public readonly planId: string,
    public readonly bucketId: string,
    public readonly name: string,
    public readonly actorId: string,
  ) {}
}
