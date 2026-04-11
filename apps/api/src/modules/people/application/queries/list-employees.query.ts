export class ListEmployeesQuery {
  constructor(
    readonly tenantId: string,
    readonly limit: number,
    readonly offset: number,
  ) {}
}
