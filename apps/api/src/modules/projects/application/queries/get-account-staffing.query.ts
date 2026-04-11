export class GetAccountStaffingQuery {
  constructor(
    readonly accountId: string,
    readonly tenantId: string,
  ) {}
}
