export class ListPlansForActorQuery {
  constructor(
    readonly actorId: string,
    readonly tenantId: string,
  ) {}
}
