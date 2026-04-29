export interface MsProfileSyncState {
  id: string
  tenantId: string
  deltaToken: string | null
  lastSyncedAt: Date | null
  createdAt: Date
}
