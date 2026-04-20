export class GetCarryOverCandidatesQuery {
  constructor(
    public readonly actorId: string,
    public readonly tenantId: string,
    public readonly today: string, // YYYY-MM-DD, tenant-local
  ) {}
}
