import type { MyDayEntry } from '../entities/my-day-entry.entity'

export const MY_DAY_REPOSITORY = Symbol('MY_DAY_REPOSITORY')

export interface MyDayInsertRow {
  actorId: string
  tenantId: string
  taskId: string
  addedDate: string // YYYY-MM-DD
}

export interface IMyDayRepository {
  findForDate(actorId: string, tenantId: string, date: string): Promise<MyDayEntry[]>
  add(entry: MyDayEntry): Promise<void>
  remove(actorId: string, taskId: string, date: string, tenantId: string): Promise<void>
  /**
   * Set completed_at = now() on every my_day_entry row referencing this task within the tenant,
   * skipping rows that already have completedAt set. Called by TaskProgressCompletedListener.
   */
  markTaskCompleted(taskId: string, tenantId: string): Promise<void>
  /**
   * Batch-insert My Day entries. Conflicting rows (same actor/task/date) are silently
   * skipped via ON CONFLICT DO NOTHING. Returns the number of rows actually inserted.
   */
  insertMany(rows: MyDayInsertRow[]): Promise<number>
}
