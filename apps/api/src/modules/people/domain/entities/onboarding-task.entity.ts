import { OnboardingAssigneeRole } from './onboarding-task-template.entity'

export type OnboardingTaskStatus = 'pending' | 'completed' | 'skipped'

export interface OnboardingTask {
  id: string
  tenantId: string
  caseId: string
  title: string
  assigneeRole: OnboardingAssigneeRole
  assigneeActorId: string | null
  dueDate: Date | null
  status: OnboardingTaskStatus
  completedAt: Date | null
  evidenceUrl: string | null
}
