export class GetBoardQuery {
  constructor(
    readonly planId: string,
    readonly actorId: string,
    readonly tenantId: string,
  ) {}
}
