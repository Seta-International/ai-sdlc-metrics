import { ConcurrentModificationException } from '../../domain/exceptions/concurrent-modification.exception'
import type { ITaskRepository } from '../../domain/repositories/task.repository'
import type { Task } from '../../domain/entities/task.entity'

export class InMemoryTaskRepository implements ITaskRepository {
  private readonly store = new Map<string, Task>()

  seed(task: Task): void {
    this.store.set(task.id, task)
  }

  async findById(id: string, tenantId: string): Promise<Task | null> {
    const task = this.store.get(id)
    return task && task.tenantId === tenantId && !task.deletedAt ? task : null
  }

  async findByBucketId(bucketId: string, tenantId: string): Promise<Task[]> {
    return [...this.store.values()].filter(
      (t) => t.bucketId === bucketId && t.tenantId === tenantId && !t.deletedAt,
    )
  }

  async listByPlanIncludingCompleted(planId: string, tenantId: string): Promise<Task[]> {
    return [...this.store.values()].filter(
      (t) => t.planId === planId && t.tenantId === tenantId && !t.deletedAt,
    )
  }

  async save(task: Task): Promise<void> {
    this.store.set(task.id, task)
  }

  async update(task: Task, expectedVersion: string): Promise<void> {
    const existing = this.store.get(task.id)
    if (!existing || existing.updatedAt.toISOString() !== expectedVersion) {
      throw new ConcurrentModificationException()
    }
    this.store.set(task.id, task)
  }

  async softDelete(id: string, tenantId: string): Promise<void> {
    const task = this.store.get(id)
    if (task && task.tenantId === tenantId && !task.deletedAt) {
      task.softDelete('system')
      this.store.set(id, task)
    }
  }

  async softDeleteMany(bucketId: string, tenantId: string): Promise<string[]> {
    const deletedIds: string[] = []
    const now = new Date()
    for (const [id, task] of this.store.entries()) {
      if (task.bucketId === bucketId && task.tenantId === tenantId && !task.deletedAt) {
        // Reconstruct with deletedAt set — Task.softDelete mutates the entity
        task.softDelete('cascade')
        deletedIds.push(id)
      }
    }
    void now
    return deletedIds
  }

  /** Test helper: clear all data */
  clear(): void {
    this.store.clear()
  }
}
