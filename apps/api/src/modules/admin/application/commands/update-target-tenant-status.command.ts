export class UpdateTargetTenantStatusCommand {
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly targetTenantId: string,
    public readonly status: 'active' | 'suspended' | 'cancelled',
  ) {}
}
