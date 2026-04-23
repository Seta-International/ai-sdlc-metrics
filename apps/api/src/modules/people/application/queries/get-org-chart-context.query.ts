export class GetOrgChartContextQuery {
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
  ) {}
}
