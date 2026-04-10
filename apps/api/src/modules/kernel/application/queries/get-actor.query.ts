export class GetActorQuery {
  constructor(
    readonly actorId: string,
    readonly tenantId: string,
  ) {}
}
