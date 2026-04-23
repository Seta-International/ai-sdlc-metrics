export class GetOrgChartChildrenQuery {
  constructor(
    public readonly tenantId: string,
    public readonly employmentId: string,
  ) {}
}
