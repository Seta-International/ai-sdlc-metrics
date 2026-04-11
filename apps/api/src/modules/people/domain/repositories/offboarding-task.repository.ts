import { OffboardingTask, OffboardingTaskStatus } from '../entities/offboarding-task.entity'

export const OFFBOARDING_TASK_REPOSITORY = Symbol('IOffboardingTaskRepository')

export interface IOffboardingTaskRepository {
  findById(id: string, tenantId: string): Promise<OffboardingTask | null>
  findByCaseId(caseId: string, tenantId: string): Promise<OffboardingTask[]>
  insertMany(tasks: Omit<OffboardingTask, 'id'>[]): Promise<OffboardingTask[]>
  updateStatus(
    id: string,
    tenantId: string,
    status: OffboardingTaskStatus,
    completedAt?: Date,
  ): Promise<void>
}
