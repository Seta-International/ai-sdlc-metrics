export class GetRolePermissionsQuery {
  constructor(
    readonly tenantId: string,
    readonly roleKey: string,
  ) {}
}
