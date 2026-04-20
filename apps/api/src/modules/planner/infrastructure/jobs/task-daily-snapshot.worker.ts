import { Inject, Injectable, Logger } from '@nestjs/common'
import type PgBoss from 'pg-boss'
import type {
  ITaskDailySnapshotRepository,
  Snapshot,
} from '../../domain/repositories/task-daily-snapshot.repository'
import { TASK_DAILY_SNAPSHOT_REPOSITORY } from '../../domain/repositories/task-daily-snapshot.repository'
import type { ITaskRepository } from '../../domain/repositories/task.repository'
import { TASK_REPOSITORY } from '../../domain/repositories/task.repository'

export interface TaskDailySnapshotJobData {
  tenantId: string
  planId: string
  snapshotDate: string // YYYY-MM-DD
}

type Priority = 'urgent' | 'important' | 'medium' | 'low'

const PRIORITY_MAP: Record<1 | 3 | 5 | 9, Priority> = {
  1: 'urgent',
  3: 'important',
  5: 'medium',
  9: 'low',
}

@Injectable()
export class TaskDailySnapshotWorker {
  private readonly logger = new Logger(TaskDailySnapshotWorker.name)

  constructor(
    @Inject(TASK_DAILY_SNAPSHOT_REPOSITORY)
    private readonly snapshots: ITaskDailySnapshotRepository,
    @Inject(TASK_REPOSITORY) private readonly tasks: ITaskRepository,
  ) {}

  async handle(job: PgBoss.Job<TaskDailySnapshotJobData>): Promise<void> {
    const { tenantId, planId, snapshotDate } = job.data

    this.logger.log(`Computing snapshot for plan=${planId} date=${snapshotDate}`)

    const allTasks = await this.tasks.listByPlanIncludingCompleted(planId, tenantId)

    const byPriority: Snapshot['byPriority'] = { urgent: 0, important: 0, medium: 0, low: 0 }
    const byBucket: Record<string, number> = {}
    const byAssignee = new Map<string, { open: number; completed: number }>()
    let openCount = 0
    let completedCount = 0
    let completedInDay = 0

    for (const t of allTasks) {
      const isCompleted = t.progress === 100
      byPriority[PRIORITY_MAP[t.priority]] += 1
      byBucket[t.bucketId] = (byBucket[t.bucketId] ?? 0) + 1
      if (isCompleted) {
        completedCount += 1
        if (t.completedAt && t.completedAt.toISOString().slice(0, 10) === snapshotDate) {
          completedInDay += 1
        }
      } else {
        openCount += 1
      }
      for (const a of t.assignees) {
        const e = byAssignee.get(a.actorId) ?? { open: 0, completed: 0 }
        if (isCompleted) e.completed += 1
        else e.open += 1
        byAssignee.set(a.actorId, e)
      }
    }

    await this.snapshots.upsert({
      tenantId,
      planId,
      snapshotDate,
      totalCount: allTasks.length,
      openCount,
      completedCount,
      byPriority,
      byBucket,
      byAssignee: [...byAssignee.entries()].map(([actorId, v]) => ({ actorId, ...v })),
      completedInDay,
    })

    this.logger.log(
      `Snapshot done for plan=${planId} date=${snapshotDate}: total=${allTasks.length} open=${openCount} completed=${completedCount}`,
    )
  }
}
