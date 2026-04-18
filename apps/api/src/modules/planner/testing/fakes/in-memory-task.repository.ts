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
