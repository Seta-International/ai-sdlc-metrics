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
  listUsers(): Promise<IdpUser[]>
  listGroupsWithMembers(): Promise<IdpGroup[]>
  testConnection(): Promise<{ success: boolean; error?: string; userCount?: number }>
}

export interface IDirectoryProviderFactory {
  create(provider: IdentityProviderEntity): IDirectoryProvider
}
