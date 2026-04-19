import type { TaskComment } from '../entities/task-comment.entity'

export const TASK_COMMENT_REPOSITORY = 'TASK_COMMENT_REPOSITORY'

export interface ITaskCommentRepository {
  add(comment: TaskComment): Promise<void>
  findById(id: string, tenantId: string): Promise<TaskComment | null>
  softDelete(id: string, tenantId: string, deletedAt: Date): Promise<void>
  /**
   * Returns comments (including tombstones / deleted rows) for a task,
   * sorted newest-first. Cursor is the id of the last comment seen.
   */
  listByTask(
    taskId: string,
    tenantId: string,
    opts: { cursor?: string; limit: number },
  ): Promise<TaskComment[]>
}
