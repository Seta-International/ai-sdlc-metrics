export class ConfigureIdentityProviderCommand {
  constructor(
    readonly tenantId: string,
    readonly providerType: 'microsoft' | 'google',
    readonly displayName: string,
    readonly clientId: string,
    readonly clientSecretRef: string,
    readonly directoryId: string | null,
    readonly isPrimary: boolean,
    readonly syncEnabled: boolean,
    readonly configuredBy: string,
  ) {}
}
