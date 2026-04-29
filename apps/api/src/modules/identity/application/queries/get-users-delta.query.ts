export class GetUsersDeltaQuery {
  constructor(
    public readonly tenantId: string,
    public readonly deltaToken: string | undefined,
  ) {}
}
