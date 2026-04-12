export class GetPersonAllocationsQuery {
  constructor(
    readonly actorId: string,
    readonly tenantId: string,
  ) {}
}
