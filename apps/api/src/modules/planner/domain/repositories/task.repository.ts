import type { Task } from '../entities/task.entity'

export const TASK_REPOSITORY = Symbol('ITaskRepository')

export interface ITaskRepository {
  findById(id: string, tenantId: string): Promise<Task | null>
  findByBucketId(bucketId: string, tenantId: string): Promise<Task[]>
  softDeleteMany(bucketId: string, tenantId: string): Promise<string[]>
}
