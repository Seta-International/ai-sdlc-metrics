import type { Task } from '../entities/task.entity'

export const TASK_REPOSITORY = Symbol('ITaskRepository')

export interface ITaskRepository {
  findById(id: string, tenantId: string): Promise<Task | null>
}
