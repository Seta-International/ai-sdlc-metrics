export class CreateSubtaskCommand {
  constructor(
    public readonly tenantId: string,
    public readonly planId: string,
    public readonly bucketId: string,
    public readonly parentTaskId: string,
    public readonly actorId: string,
    public readonly title: string,
  ) {}
}
