export interface SyncHistory {
  id: string
  tenantId: string
  identityProviderId: string
  status: 'completed' | 'failed'
  usersCreated: number
  usersDeactivated: number
  rolesChanged: number
  errorMessage: string | null
  startedAt: Date
  completedAt: Date
}
