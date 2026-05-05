import type { IdentityProviderEntity } from '../entities/identity-provider.entity'

export const IDENTITY_PROVIDER_REPOSITORY = Symbol('IIdentityProviderRepository')

export interface IIdentityProviderRepository {
  findById(id: string, tenantId: string): Promise<IdentityProviderEntity | null>
  findByTenantId(tenantId: string): Promise<IdentityProviderEntity[]>
  findPrimary(tenantId: string): Promise<IdentityProviderEntity | null>
  /** Alias for findPrimary — used by Plan 05 handlers */
  findPrimaryByTenantId(tenantId: string): Promise<IdentityProviderEntity | null>
  insert(data: {
    tenantId: string
    providerType: IdentityProviderEntity['providerType']
    displayName: string
    clientId: string
    clientSecretRef: string
    directoryId: string | null
    isPrimary: boolean
    syncEnabled: boolean
  }): Promise<IdentityProviderEntity>
  update(
    id: string,
    tenantId: string,
    data: Partial<
      Pick<
        IdentityProviderEntity,
        | 'displayName'
        | 'clientId'
        | 'clientSecretRef'
        | 'directoryId'
        | 'isPrimary'
        | 'syncEnabled'
        | 'lastSyncAt'
        | 'syncStatus'
        | 'syncProcessed'
        | 'syncTotal'
      >
    >,
  ): Promise<void>
}
