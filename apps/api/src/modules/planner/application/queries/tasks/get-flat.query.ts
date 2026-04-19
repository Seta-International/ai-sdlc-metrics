export class GetFlatTasksQuery {
  constructor(
    public readonly planId: string,
    public readonly actorId: string,
    public readonly tenantId: string,
  ) {}
}
