export class GetTaskHistoryQuery {
  constructor(
    public readonly taskId: string,
    public readonly tenantId: string,
    public readonly cursor: string | undefined,
    public readonly limit: number,
  ) {}
}
