import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  TASK_DAILY_SNAPSHOT_REPOSITORY,
  type ITaskDailySnapshotRepository,
} from '../../../domain/repositories/task-daily-snapshot.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { GetTaskTrendsQuery, type TrendRange } from './get-trends.query'

export type TaskTrends = {
  rangeStart: string // YYYY-MM-DD
  rangeEnd: string // YYYY-MM-DD
  series: Array<{ date: string; openCount: number; completedCount: number; completedInDay: number }>
  weeklyThroughput: Array<{ weekStart: string; completedCount: number }>
}

const DAYS: Record<TrendRange, number> = { '7d': 7, '30d': 30, '90d': 90 }

function aggregateByIsoWeek(series: TaskTrends['series']): TaskTrends['weeklyThroughput'] {
  const byWeek = new Map<string, number>()
  for (const s of series) {
    const d = new Date(s.date + 'T00:00:00Z')
    const isoDow = (d.getUTCDay() + 6) % 7 // 0=Mon
    const monday = new Date(d.getTime() - isoDow * 86_400_000).toISOString().slice(0, 10)
    byWeek.set(monday, (byWeek.get(monday) ?? 0) + s.completedInDay)
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, completedCount]) => ({ weekStart, completedCount }))
}

@QueryHandler(GetTaskTrendsQuery)
export class GetTaskTrendsHandler implements IQueryHandler<GetTaskTrendsQuery, TaskTrends> {
  constructor(
    @Inject(TASK_DAILY_SNAPSHOT_REPOSITORY)
    private readonly snapshots: ITaskDailySnapshotRepository,
    private readonly planAuthz: PlanAuthorizationService,
  ) {}

  async execute(q: GetTaskTrendsQuery): Promise<TaskTrends> {
    await this.planAuthz.assertCanReadPlan(q.actorId, q.planId, q.tenantId)

    const days = DAYS[q.range]
    const endDate = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10) // yesterday
    const startDate = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)

    const rows = await this.snapshots.listForPlanInRange(q.planId, q.tenantId, startDate, endDate)

    const series = rows.map((s) => ({
      date: s.snapshotDate,
      openCount: s.openCount,
      completedCount: s.completedCount,
      completedInDay: s.completedInDay,
    }))

    return {
      rangeStart: startDate,
      rangeEnd: endDate,
      series,
      weeklyThroughput: aggregateByIsoWeek(series),
    }
  }
}
