export class GetActivityFeedQuery {
  constructor(
    public readonly employmentId: string,
    public readonly tenantId: string,
    public readonly limit: number,
    public readonly cursor: string | undefined,
  ) {}
}
