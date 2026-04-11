export class GetSyncHistoryQuery {
  constructor(
    readonly tenantId: string,
    readonly limit: number,
  ) {}
}
