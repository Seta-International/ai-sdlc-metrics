export class GetRoleGrantsQuery {
  constructor(
    readonly actorId: string,
    readonly tenantId: string,
  ) {}
}
