export type OffboardingTaskStatus = 'pending' | 'completed' | 'skipped'

export interface OffboardingTask {
  id: string
  tenantId: string
  caseId: string
  title: string
  assigneeRole: string
  assigneeActorId: string | null
  dueDate: Date | null
  status: OffboardingTaskStatus
  completedAt: Date | null
  evidenceUrl: string | null
}
