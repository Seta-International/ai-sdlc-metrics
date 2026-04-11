import { OffboardingAssigneeRole } from './offboarding-task-template.entity'

export type OffboardingTaskStatus = 'pending' | 'completed' | 'skipped'

export interface OffboardingTask {
  id: string
  tenantId: string
  caseId: string
  title: string
  assigneeRole: OffboardingAssigneeRole
  assigneeActorId: string | null
  dueDate: Date | null
  isRequired: boolean
  status: OffboardingTaskStatus
  completedAt: Date | null
  evidenceUrl: string | null
}
