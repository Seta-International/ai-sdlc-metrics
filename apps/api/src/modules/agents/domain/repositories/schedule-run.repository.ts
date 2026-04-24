import type { ScheduleRun } from '../entities/schedule-run.entity'

export const SCHEDULE_RUN_REPOSITORY = Symbol('IScheduleRunRepository')

export interface IScheduleRunRepository {
  insert(opts: {
    scheduleId: string
    tenantId: string
    traceId: string
    flowId: string
    pgBossJobId?: string
    taintSeeded: boolean
    pinnedVersions: Record<string, string>
    firedBy: string
    parentTraceId?: string
  }): Promise<ScheduleRun>

  updateOutcome(opts: {
    tenantId: string
    runId: string
    outcome: string
    endedAt: Date
    costSpentUsd?: number
  }): Promise<void>

  getById(opts: { tenantId: string; runId: string }): Promise<ScheduleRun | null>

  getByTraceId(opts: { tenantId: string; traceId: string }): Promise<ScheduleRun | null>

  listBySchedule(opts: {
    tenantId: string
    scheduleId: string
    limit?: number
  }): Promise<ScheduleRun[]>

  countTodayBySchedule(opts: { tenantId: string; scheduleId: string }): Promise<number>

  sumTodayCostBySchedule(opts: { tenantId: string; scheduleId: string }): Promise<number>
}
