import type { Task } from '../entities/task.entity'

export const TASK_REPOSITORY = Symbol('ITaskRepository')

export interface ITaskRepository {
  findById(id: string, tenantId: string): Promise<Task | null>
  findByBucketId(bucketId: string, tenantId: string): Promise<Task[]>
  /**
   * Returns all non-deleted tasks for a given plan, including completed ones.
   * Used by snapshot workers that need the full task set.
   */
  listByPlanIncludingCompleted(planId: string, tenantId: string): Promise<Task[]>
  save(task: Task): Promise<void>
  /**
   * Persists mutations to an existing task.
   * @param expectedVersion - the `updatedAt` ISO string of the row read before mutation.
   *   If the DB row's `updated_at` no longer matches, throws ConcurrentModificationException.
   */
  update(task: Task, expectedVersion: string): Promise<void>
  softDelete(id: string, tenantId: string): Promise<void>
  softDeleteMany(bucketId: string, tenantId: string): Promise<string[]>
}
