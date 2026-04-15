export type OnboardingCaseStatus = 'in_progress' | 'completed'

export interface OnboardingCase {
  id: string
  tenantId: string
  employmentId: string
  templateId: string | null
  status: OnboardingCaseStatus
  createdAt: Date
  updatedAt: Date
}
