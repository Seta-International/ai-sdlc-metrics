import { OffboardingReasonCategory } from './offboarding-template.entity'

export type OffboardingCaseStatus = 'pending' | 'approved' | 'processing' | 'completed' | 'rejected'

export interface OffboardingCase {
  id: string
  tenantId: string
  profileId: string
  templateId: string | null
  reason: string
  reasonCategory: OffboardingReasonCategory | null
  decisionCaseId: string | null
  status: OffboardingCaseStatus
  createdAt: Date
  updatedAt: Date
}
