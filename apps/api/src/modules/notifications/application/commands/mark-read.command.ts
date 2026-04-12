export class MarkReadCommand {
  constructor(
    public readonly tenantId: string,
    public readonly ids: string[],
  ) {}
}

export class MarkAllReadCommand {
  constructor(
    public readonly tenantId: string,
    public readonly recipientId: string,
  ) {}
}
