export class UpdateTenantTimezoneCommand {
  constructor(
    public readonly tenantId: string,
    public readonly timezone: string,
  ) {}
}
