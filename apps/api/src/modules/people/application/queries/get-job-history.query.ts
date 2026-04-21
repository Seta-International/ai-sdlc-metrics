export class GetJobHistoryQuery {
  constructor(
    public readonly profileId: string,
    public readonly tenantId: string,
  ) {}
}
