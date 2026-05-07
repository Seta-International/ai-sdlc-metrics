import type { OnboardingCaseStage } from '../../domain/entities/onboarding-case.entity'

export class ListOnboardingCasesQuery {
  constructor(public readonly tenantId: string) {}
}

export interface OnboardingCaseListItem {
  id: string
  employmentId: string
  employeeName: string
  jobTitle: string
  department: string
  avatarUrl: string | null
  startDate: string
  stage: OnboardingCaseStage
  tasksTotal: number
  tasksCompleted: number
  blockers: number
}
