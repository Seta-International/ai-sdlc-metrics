export class GetPersonProfileQuery {
  constructor(
    readonly actorId: string,
    readonly tenantId: string,
  ) {}
}
