export const TASK_HISTORY_REPOSITORY = Symbol('ITaskHistoryRepository')

export interface HistoryRecord {
  id: string
  taskId: string
  tenantId: string
  actorId: string
  field: string
  oldValue: unknown
  newValue: unknown
  changedAt: Date
}

export interface HistoryPage {
  items: HistoryRecord[]
  nextCursor: string | null
}

export interface ITaskHistoryRepository {
  append(record: HistoryRecord): Promise<void>
  listByTask(
    taskId: string,
    tenantId: string,
    opts: { cursor?: string; limit: number },
  ): Promise<HistoryPage>
}
