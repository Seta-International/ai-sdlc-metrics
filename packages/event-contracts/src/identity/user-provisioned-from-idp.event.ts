export class UserProvisionedFromIdpEvent {
  static readonly eventName = 'identity.user-provisioned-from-idp'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly email: string,
    public readonly externalId: string,
    public readonly identityProviderId: string,
  ) {}
}
