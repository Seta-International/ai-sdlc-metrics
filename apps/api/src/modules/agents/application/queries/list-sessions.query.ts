export class ListSessionsQuery {
  constructor(
    readonly actorId: string,
    readonly tenantId: string,
    readonly limit: number = 20,
  ) {}
}
