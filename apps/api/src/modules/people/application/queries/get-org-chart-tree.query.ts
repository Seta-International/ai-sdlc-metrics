export class GetOrgChartTreeQuery {
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly teamId: string | null,
    public readonly depth: number,
  ) {}
}
