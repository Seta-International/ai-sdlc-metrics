import type { Task } from '../entities/task.entity'

export const TASK_REPOSITORY = Symbol('ITaskRepository')

export interface PendingTaskRef {
  id: string
  planId: string
  pendingMsAssignments: string[]
}

export interface MsTaskUpsertProps {
  tenantId: string
  msTaskId: string
  msTaskEtag: string
  msBucketId: string | null
  msPlanId: string
  localPlanId: string
  title: string
  orderHint: string
  assigneePriority: string | null
  percentComplete: number
  priority: number
  startDateTime: Date | null
  dueDateTime: Date | null
  completedDateTime: Date | null
  appliedCategories: Record<string, boolean>
  aadAssignments: Record<string, { orderHint: string }>
  assigneeActorIds: string[]
  pendingMsAssignments: string[]
}

export interface MsTaskDetailsUpsertProps {
  taskId: string
  msTaskId: string
  msDetailsEtag: string
  description: string | null
  previewType: string
  checklist: Array<{ id: string; title: string; isChecked: boolean; orderHint: string }>
  references: Array<{ encodedUrl: string; alias: string | null; type: string | null }>
}

export interface MsSyncedTaskRef {
  id: string
  msTaskId: string | null
  msTaskEtag: string | null
  msDetailsEtag: string | null
  msSoftDeletedAt: Date | null
}

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
  findByMsTaskId(
    tenantId: string,
    msTaskId: string,
  ): Promise<{
    id: string
    msTaskEtag: string | null
    msDetailsEtag: string | null
    msSoftDeletedAt: Date | null
  } | null>
  upsertFromMs(props: MsTaskUpsertProps, opts: { origin: string }): Promise<{ id: string }>
  upsertDetailsFromMs(props: MsTaskDetailsUpsertProps, opts: { origin: string }): Promise<void>
  softDeleteFromMs(id: string, opts: { origin: string }): Promise<void>
  listByPlan(planId: string, opts: { onlySynced: boolean }): Promise<MsSyncedTaskRef[]>
  listWithPendingAssignments(tenantId: string): Promise<PendingTaskRef[]>
  applyPendingResolution(
    taskId: string,
    resolution: { newAssignees: string[]; stillPending: string[]; origin: string },
  ): Promise<void>
}
