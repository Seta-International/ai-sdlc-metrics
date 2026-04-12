export class DirectorySyncCompletedEvent {
  static readonly eventName = 'identity.directory-sync-completed'
  constructor(
    public readonly tenantId: string,
    public readonly identityProviderId: string,
    public readonly usersProcessed: number,
    public readonly groupsProcessed: number,
    public readonly completedAt: string,
  ) {}
}
