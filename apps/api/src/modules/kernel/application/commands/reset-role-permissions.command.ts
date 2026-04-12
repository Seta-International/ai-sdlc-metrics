export class ResetRolePermissionsCommand {
  constructor(
    readonly tenantId: string,
    readonly roleKey: string,
    readonly resetBy: string,
  ) {}
}
