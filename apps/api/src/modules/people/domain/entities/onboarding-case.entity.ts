export type OnboardingCaseStatus = 'in_progress' | 'completed'

export type OnboardingCaseStage = 'offer_accepted' | 'paperwork' | 'equipment' | 'first_day_ready'

export interface OnboardingCase {
  id: string
  tenantId: string
  employmentId: string
  templateId: string | null
  status: OnboardingCaseStatus
  stage: OnboardingCaseStage
  createdAt: Date
  updatedAt: Date
}
