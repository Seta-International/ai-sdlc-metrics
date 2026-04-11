import { OffboardingCase, OffboardingCaseStatus } from '../entities/offboarding-case.entity'

export const OFFBOARDING_CASE_REPOSITORY = Symbol('IOffboardingCaseRepository')

export interface IOffboardingCaseRepository {
  findById(id: string, tenantId: string): Promise<OffboardingCase | null>
  findActiveByProfileId(profileId: string, tenantId: string): Promise<OffboardingCase | null>
  insert(data: Omit<OffboardingCase, 'id' | 'createdAt' | 'updatedAt'>): Promise<OffboardingCase>
  updateStatus(id: string, tenantId: string, status: OffboardingCaseStatus): Promise<void>
  update(
    id: string,
    tenantId: string,
    data: Partial<Pick<OffboardingCase, 'status' | 'decisionCaseId'>>,
  ): Promise<void>
  insertTask(data: {
    tenantId: string
    caseId: string
    actorId: string | null
    title: string
    description: string | null
    assigneeRole: string
    isRequired: boolean
    dueDate: Date
  }): Promise<void>
  getRequiredTasks(
    caseId: string,
    tenantId: string,
  ): Promise<Array<{ id: string; status: string; isRequired: boolean }>>
  updateTaskStatus(
    taskId: string,
    tenantId: string,
    status: 'pending' | 'completed' | 'skipped',
    completedAt?: Date,
    evidenceUrl?: string | null,
  ): Promise<void>
  findTaskById(
    taskId: string,
    tenantId: string,
  ): Promise<{ id: string; caseId: string; status: string; isRequired: boolean } | null>
}
