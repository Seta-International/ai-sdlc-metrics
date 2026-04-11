export class GetProfileQuery {
  constructor(
    readonly actorId: string,
    readonly tenantId: string,
  ) {}
}
