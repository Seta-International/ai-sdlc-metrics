export class GetPlanQuery {
  constructor(
    readonly actorId: string,
    readonly planId: string,
    readonly tenantId: string,
  ) {}
}
