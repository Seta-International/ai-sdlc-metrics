export type ProfileChangeStatus = 'pending' | 'approved' | 'rejected' | 'superseded'

export interface ProfileChangeRequest {
  id: string
  tenantId: string
  profileId: string
  fieldPath: string
  oldValue: unknown | null
  newValue: unknown
  status: ProfileChangeStatus
  decisionCaseId: string | null
  requestedBy: string
  reviewedBy: string | null
  createdAt: Date
}
