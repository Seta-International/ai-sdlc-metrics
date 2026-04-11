export class ListProjectsQuery {
  constructor(
    readonly tenantId: string,
    readonly limit: number,
    readonly offset: number,
    readonly accountId?: string,
  ) {}
}
