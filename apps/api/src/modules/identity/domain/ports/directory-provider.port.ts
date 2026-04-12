export const DIRECTORY_PROVIDER = Symbol('IDirectoryProvider')

export interface DirectoryGroup {
  externalGroupId: string
  displayName: string
  memberCount: number
}

export interface DirectoryUser {
  ssoSubject: string
  email: string
  displayName: string
  isEnabled: boolean
  groups: string[]
}

export interface IDirectoryProvider {
  testConnection(
    providerType: 'microsoft' | 'google',
    clientId: string,
    clientSecretRef: string,
    directoryId: string,
  ): Promise<{ success: boolean; error?: string; userCount?: number }>

  listGroups(
    providerType: 'microsoft' | 'google',
    clientId: string,
    clientSecretRef: string,
    directoryId: string,
  ): Promise<DirectoryGroup[]>

  listUsers(
    providerType: 'microsoft' | 'google',
    clientId: string,
    clientSecretRef: string,
    directoryId: string,
  ): Promise<DirectoryUser[]>
}
