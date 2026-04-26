export class GetUserIdentityByEmailAndTenantQuery {
  constructor(
    readonly email: string,
    readonly tenantId: string,
  ) {}
}
