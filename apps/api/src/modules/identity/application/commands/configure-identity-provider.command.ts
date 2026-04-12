export type ProviderTypeValue = 'microsoft' | 'google'

export class ConfigureIdentityProviderCommand {
  constructor(
    readonly tenantId: string,
    readonly providerType: ProviderTypeValue,
    readonly displayName: string,
    readonly clientId: string,
    readonly clientSecretRef: string,
    readonly directoryId: string,
    readonly syncEnabled: boolean,
    readonly configuredBy: string,
    readonly existingProviderId?: string,
  ) {}
}
