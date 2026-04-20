export class GetPersonalChartsQuery {
  constructor(
    public readonly actorId: string,
    public readonly tenantId: string,
  ) {}
}
