export class ListAccountsQuery {
  constructor(
    readonly tenantId: string,
    readonly limit: number,
    readonly offset: number,
  ) {}
}
