export type ChangeRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'superseded'
  | 'scheduled'
  | 'applied'

export interface ProfileChangeRequest {
  id: string
  tenantId: string
  employmentId: string
  batchId: string | null
  reason: string | null
  fieldPath: string
  oldValue: unknown | null
  newValue: unknown
  effectiveDate: Date | null
  status: ChangeRequestStatus
  requestedBy: string
  reviewedBy: string | null
  reviewedAt: Date | null
  reviewNote: string | null
  decisionCaseId: string | null
  createdAt: Date
}
