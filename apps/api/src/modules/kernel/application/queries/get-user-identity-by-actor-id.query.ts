export class GetUserIdentityByActorIdQuery {
  constructor(
    readonly actorId: string,
    readonly tenantId: string,
  ) {}
}
