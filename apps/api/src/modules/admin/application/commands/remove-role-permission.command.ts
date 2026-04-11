export class RemoveRolePermissionCommand {
  constructor(
    readonly tenantId: string,
    readonly roleKey: string,
    readonly permissionKey: string,
    readonly removedBy: string,
  ) {}
}
