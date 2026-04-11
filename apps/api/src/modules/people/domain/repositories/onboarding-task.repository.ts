import { OnboardingTask, OnboardingTaskStatus } from '../entities/onboarding-task.entity'

export const ONBOARDING_TASK_REPOSITORY = Symbol('IOnboardingTaskRepository')

export interface IOnboardingTaskRepository {
  findById(id: string, tenantId: string): Promise<OnboardingTask | null>
  findByCaseId(caseId: string, tenantId: string): Promise<OnboardingTask[]>
  insertMany(tasks: Omit<OnboardingTask, 'id'>[]): Promise<OnboardingTask[]>
  updateStatus(
    id: string,
    tenantId: string,
    status: OnboardingTaskStatus,
    completedAt?: Date,
  ): Promise<void>
}
