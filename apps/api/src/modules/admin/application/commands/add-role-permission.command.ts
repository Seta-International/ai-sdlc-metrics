export class AddRolePermissionCommand {
  constructor(
    readonly tenantId: string,
    readonly roleKey: string,
    readonly permissionKey: string,
    readonly addedBy: string,
  ) {}
}
