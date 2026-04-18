export class RenameBucketCommand {
  constructor(
    public readonly tenantId: string,
    public readonly planId: string,
    public readonly bucketId: string,
    public readonly name: string,
    public readonly actorId: string,
    public readonly expectedVersion?: Date,
  ) {}
}
