export type IdpProviderType = 'microsoft' | 'google'
export type IdpSyncStatus = 'idle' | 'running' | 'failed'

export interface IdentityProviderEntity {
  id: string
  tenantId: string
  providerType: IdpProviderType
  displayName: string
  clientId: string
  clientSecretRef: string
  directoryId: string | null
  isPrimary: boolean
  syncEnabled: boolean
  lastSyncAt: Date | null
  syncStatus: IdpSyncStatus
  createdAt: Date
  updatedAt: Date
}
