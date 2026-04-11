export type MappingScopeType = 'global' | 'department' | 'project' | 'account'

export interface IdpGroupMapping {
  id: string
  tenantId: string
  identityProviderId: string
  externalGroupId: string
  externalGroupName: string
  roleKey: string
  scopeType: MappingScopeType
  scopeId: string | null
  createdAt: Date
  updatedAt: Date
}
