export class GetAccountQuery {
  constructor(
    readonly accountId: string,
    readonly tenantId: string,
  ) {}
}
