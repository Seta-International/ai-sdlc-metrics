export const TASK_DAILY_SNAPSHOT_REPOSITORY = Symbol('TASK_DAILY_SNAPSHOT_REPOSITORY')

export interface Snapshot {
  tenantId: string
  planId: string
  snapshotDate: string // ISO date, no time, YYYY-MM-DD
  totalCount: number
  openCount: number
  completedCount: number
  byPriority: Record<'urgent' | 'important' | 'medium' | 'low', number>
  byBucket: Record<string, number>
  byAssignee: Array<{ actorId: string; open: number; completed: number }>
  completedInDay: number
}

export interface ITaskDailySnapshotRepository {
  upsert(snapshot: Snapshot): Promise<void>
  listForPlanInRange(
    planId: string,
    tenantId: string,
    startDate: string,
    endDate: string,
  ): Promise<Snapshot[]>
}
