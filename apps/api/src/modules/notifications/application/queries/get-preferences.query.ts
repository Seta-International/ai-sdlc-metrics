export class GetPreferencesQuery {
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
  ) {}
}
