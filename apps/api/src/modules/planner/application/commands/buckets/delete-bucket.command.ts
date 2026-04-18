export class DeleteBucketCommand {
  constructor(
    public readonly tenantId: string,
    public readonly planId: string,
    public readonly bucketId: string,
    public readonly actorId: string,
  ) {}
}
