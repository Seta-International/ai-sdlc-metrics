export class GetTenantAdminSummaryQuery {
  constructor(
    readonly callerTenantId: string,
    readonly callerActorId: string,
    readonly callerRoles: readonly string[],
    readonly targetTenantId: string,
  ) {}
}
