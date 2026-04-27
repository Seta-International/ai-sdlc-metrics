export class PushTaskCommand {
  constructor(
    public readonly taskId: string,
    public readonly tenantId: string,
  ) {}
}
