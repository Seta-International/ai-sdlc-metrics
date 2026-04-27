import { ConcurrentModificationException } from '../../domain/exceptions/concurrent-modification.exception'
import type {
  ITaskRepository,
  MsSyncedTaskRef,
  MsTaskDetailsUpsertProps,
  MsTaskUpsertProps,
  PendingTaskRef,
} from '../../domain/repositories/task.repository'
import { Task } from '../../domain/entities/task.entity'

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

  async findByMsTaskId(
    tenantId: string,
    msTaskId: string,
  ): Promise<{
    id: string
    msTaskEtag: string | null
    msDetailsEtag: string | null
    msSoftDeletedAt: Date | null
  } | null> {
    const task = [...this.store.values()].find(
      (t) => t.tenantId === tenantId && t.msTaskId === msTaskId,
    )
    if (!task) return null
    return {
      id: task.id,
      msTaskEtag: task.msTaskEtag,
      msDetailsEtag: task.msTaskDetailsEtag,
      msSoftDeletedAt: null,
    }
  }

  async upsertFromMs(props: MsTaskUpsertProps, _opts: { origin: string }): Promise<{ id: string }> {
    const existing = [...this.store.values()].find(
      (t) => t.tenantId === props.tenantId && t.msTaskId === props.msTaskId,
    )
    if (existing) return { id: existing.id }
    const now = new Date()
    const id = `task-${props.msTaskId}`
    const task = Task.reconstitute({
      id,
      tenantId: props.tenantId,
      planId: props.localPlanId,
      bucketId: props.msBucketId ?? props.localPlanId,
      title: props.title,
      description: '',
      progress: props.percentComplete as 0 | 50 | 100,
      priority: props.priority as 1 | 3 | 5 | 9,
      startDate: props.startDateTime,
      dueDate: props.dueDateTime,
      orderHint: props.orderHint,
      createdBy: 'ms-sync',
      createdAt: now,
      updatedAt: now,
      completedBy: null,
      completedAt: props.completedDateTime,
      deletedAt: null,
      checklistItemCount: 0,
      checklistCheckedCount: 0,
      checklistItems: [],
      assignees: [],
      appliedLabels: [],
      coverAttachmentId: null,
      msTaskId: props.msTaskId,
      msTaskEtag: props.msTaskEtag,
      msTaskDetailsEtag: null,
      pendingMsAssignments: props.pendingMsAssignments,
    })
    this.store.set(id, task)
    return { id }
  }

  async upsertDetailsFromMs(
    _props: MsTaskDetailsUpsertProps,
    _opts: { origin: string },
  ): Promise<void> {
    // no-op in tests
  }

  async softDeleteFromMs(id: string, _opts: { origin: string }): Promise<void> {
    const task = this.store.get(id)
    if (task && !task.deletedAt) {
      task.softDelete('ms-sync')
    }
  }

  async listByPlan(planId: string, opts: { onlySynced: boolean }): Promise<MsSyncedTaskRef[]> {
    return [...this.store.values()]
      .filter((t) => t.planId === planId && !t.deletedAt)
      .filter((t) => !opts.onlySynced || t.msTaskId !== null)
      .map((t) => ({
        id: t.id,
        msTaskId: t.msTaskId,
        msTaskEtag: t.msTaskEtag,
        msDetailsEtag: t.msTaskDetailsEtag,
        msSoftDeletedAt: null,
      }))
  }

  async listWithPendingAssignments(tenantId: string): Promise<PendingTaskRef[]> {
    return [...this.store.values()]
      .filter((t) => t.tenantId === tenantId && !t.deletedAt && t.pendingMsAssignments.length > 0)
      .map((t) => ({ id: t.id, planId: t.planId, pendingMsAssignments: t.pendingMsAssignments }))
  }

  async applyPendingResolution(
    taskId: string,
    _resolution: { newAssignees: string[]; stillPending: string[]; origin: string },
  ): Promise<void> {
    void taskId
  }

  async markPushed(_id: string, _pushedAt: Date): Promise<void> {}

  async updateMsEtag(
    _id: string,
    _etags: { msTaskEtag?: string | null; msDetailsEtag?: string | null },
  ): Promise<void> {}

  async applyMsWonFields(
    _taskId: string,
    _freshMsBody: Record<string, unknown>,
    _opts: { origin: string },
  ): Promise<void> {}

  /** Test helper: clear all data */
  clear(): void {
    this.store.clear()
  }
}
