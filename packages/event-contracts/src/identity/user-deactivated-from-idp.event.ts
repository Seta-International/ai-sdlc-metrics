export class UserDeactivatedFromIdpEvent {
  static readonly eventName = 'identity.user-deactivated-from-idp'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly externalId: string,
    public readonly identityProviderId: string,
  ) {}
}
