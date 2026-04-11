import { OnboardingCase, OnboardingCaseStatus } from '../entities/onboarding-case.entity'

export const ONBOARDING_CASE_REPOSITORY = Symbol('IOnboardingCaseRepository')

export interface IOnboardingCaseRepository {
  findById(id: string, tenantId: string): Promise<OnboardingCase | null>
  findByProfileId(profileId: string, tenantId: string): Promise<OnboardingCase | null>
  insert(data: Omit<OnboardingCase, 'id' | 'createdAt' | 'updatedAt'>): Promise<OnboardingCase>
  updateStatus(id: string, tenantId: string, status: OnboardingCaseStatus): Promise<void>
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
