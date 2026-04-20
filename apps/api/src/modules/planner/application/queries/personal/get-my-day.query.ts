export class GetMyDayQuery {
  constructor(
    public readonly actorId: string,
    public readonly tenantId: string,
    public readonly date: string, // YYYY-MM-DD, tenant-local
  ) {}
}
