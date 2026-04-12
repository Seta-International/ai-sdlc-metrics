export class UnreadCountQuery {
  constructor(
    public readonly tenantId: string,
    public readonly recipientId: string,
  ) {}
}
