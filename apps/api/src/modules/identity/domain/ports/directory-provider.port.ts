import type { IdentityProviderEntity } from '../entities/identity-provider.entity'

export const DIRECTORY_PROVIDER_FACTORY = Symbol('IDirectoryProviderFactory')

export interface IdpUser {
  externalId: string
  email: string
  displayName: string
  isActive: boolean
}

export interface IdpGroup {
  externalGroupId: string
  displayName: string
  memberExternalIds: string[]
}

export interface IDirectoryProvider {
  testConnection(): Promise<{ ok: true } | { ok: false; error: string }>
  listUsers(): Promise<IdpUser[]>
  listGroupsWithMembers(): Promise<IdpGroup[]>
}

export interface IDirectoryProviderFactory {
  create(provider: IdentityProviderEntity): Promise<IDirectoryProvider>
}
