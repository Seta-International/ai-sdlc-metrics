export class RoleGrantSyncedEvent {
  static readonly eventName = 'identity.role-grant-synced'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly roleKey: string,
    public readonly scopeType: string,
    public readonly scopeId: string | null,
    public readonly action: 'granted' | 'revoked',
    public readonly identityProviderId: string,
  ) {}
}
