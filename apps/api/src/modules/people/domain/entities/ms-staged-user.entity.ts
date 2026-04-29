export type MsStagedUserStatus = 'pending' | 'imported' | 'skipped'

export interface MsStagedUser {
  id: string
  tenantId: string
  msExternalId: string
  displayName: string
  email: string | null
  jobTitle: string | null
  department: string | null
  officeLocation: string | null
  mobilePhone: string | null
  workPhone: string | null
  managerMsId: string | null
  photoDocumentId: string | null
  status: MsStagedUserStatus
  importedEmploymentId: string | null
  lastSeenAt: Date
  createdAt: Date
}
