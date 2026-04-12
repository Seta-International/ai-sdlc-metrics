export type ProviderType = 'microsoft' | 'google'
export type SyncStatus = 'idle' | 'running' | 'failed'

export interface IdentityProvider {
  id: string
  tenantId: string
  providerType: ProviderType
  displayName: string
  clientId: string
  clientSecretRef: string
  directoryId: string
  isPrimary: boolean
  syncEnabled: boolean
  lastSyncAt: Date | null
  syncStatus: SyncStatus
  createdAt: Date
  updatedAt: Date
}

export const IDENTITY_PROVIDER_REPOSITORY = Symbol('IIdentityProviderRepository')

export interface IIdentityProviderRepository {
  findById(id: string, tenantId: string): Promise<IdentityProvider | null>
  findPrimaryByTenantId(tenantId: string): Promise<IdentityProvider | null>
  insert(data: {
    tenantId: string
    providerType: IdentityProvider['providerType']
    displayName: string
    clientId: string
    clientSecretRef: string
    directoryId: string
    isPrimary: boolean
    syncEnabled: boolean
  }): Promise<IdentityProvider>
  update(
    id: string,
    tenantId: string,
    data: Partial<
      Pick<
        IdentityProvider,
        | 'displayName'
        | 'clientId'
        | 'clientSecretRef'
        | 'directoryId'
        | 'syncEnabled'
        | 'syncStatus'
        | 'lastSyncAt'
      >
    >,
  ): Promise<void>
}
