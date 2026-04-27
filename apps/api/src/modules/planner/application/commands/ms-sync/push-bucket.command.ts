export class PushBucketCommand {
  constructor(
    public readonly bucketId: string,
    public readonly tenantId: string,
  ) {}
}
