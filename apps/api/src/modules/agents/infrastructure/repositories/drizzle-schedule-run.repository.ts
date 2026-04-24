import { Inject, Injectable } from '@nestjs/common'
import { and, count, desc, eq, gte, sum } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { agentScheduleRun } from '../schema/agent-schedule-run.schema'
import type { AgentScheduleRunRow } from '../schema/agent-schedule-run.schema'
import { SCHEDULE_RUN_REPOSITORY } from '../../domain/repositories/schedule-run.repository'
import type { IScheduleRunRepository } from '../../domain/repositories/schedule-run.repository'
import type { ScheduleRun } from '../../domain/entities/schedule-run.entity'

function toDomain(row: AgentScheduleRunRow): ScheduleRun {
  return {
    id: row.id,
    scheduleId: row.scheduleId,
    tenantId: row.tenantId,
    traceId: row.traceId,
    flowId: row.flowId,
    pgBossJobId: row.pgBossJobId ?? null,
    startedAt: row.startedAt,
    endedAt: row.endedAt ?? null,
    outcome: row.outcome as ScheduleRun['outcome'],
    taintSeeded: row.taintSeeded,
    pinnedVersions: row.pinnedVersions as ScheduleRun['pinnedVersions'],
    costSpentUsd: row.costSpentUsd as string,
    firedBy: row.firedBy,
    parentTraceId: row.parentTraceId ?? null,
  }
}

@Injectable()
export class DrizzleScheduleRunRepository implements IScheduleRunRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async insert(opts: {
    scheduleId: string
    tenantId: string
    traceId: string
    flowId: string
    pgBossJobId?: string
    taintSeeded: boolean
    pinnedVersions: Record<string, string>
    firedBy: string
    parentTraceId?: string
  }): Promise<ScheduleRun> {
    const rows = await this.db
      .insert(agentScheduleRun)
      .values({
        scheduleId: opts.scheduleId,
        tenantId: opts.tenantId,
        traceId: opts.traceId,
        flowId: opts.flowId,
        pgBossJobId: opts.pgBossJobId ?? null,
        taintSeeded: opts.taintSeeded,
        pinnedVersions: opts.pinnedVersions as Record<string, unknown>,
        firedBy: opts.firedBy,
        parentTraceId: opts.parentTraceId ?? null,
      })
      .returning()

    return toDomain(rows[0] as AgentScheduleRunRow)
  }

  async updateOutcome(opts: {
    tenantId: string
    runId: string
    outcome: string
    endedAt: Date
    costSpentUsd?: number
  }): Promise<void> {
    await this.db
      .update(agentScheduleRun)
      .set({
        outcome: opts.outcome,
        endedAt: opts.endedAt,
        ...(opts.costSpentUsd !== undefined ? { costSpentUsd: String(opts.costSpentUsd) } : {}),
      })
      .where(and(eq(agentScheduleRun.tenantId, opts.tenantId), eq(agentScheduleRun.id, opts.runId)))
  }

  async getById(opts: { tenantId: string; runId: string }): Promise<ScheduleRun | null> {
    const rows = await this.db
      .select()
      .from(agentScheduleRun)
      .where(and(eq(agentScheduleRun.tenantId, opts.tenantId), eq(agentScheduleRun.id, opts.runId)))
      .limit(1)

    return rows[0] ? toDomain(rows[0] as AgentScheduleRunRow) : null
  }

  async getByTraceId(opts: { tenantId: string; traceId: string }): Promise<ScheduleRun | null> {
    const rows = await this.db
      .select()
      .from(agentScheduleRun)
      .where(
        and(
          eq(agentScheduleRun.tenantId, opts.tenantId),
          eq(agentScheduleRun.traceId, opts.traceId),
        ),
      )
      .limit(1)

    return rows[0] ? toDomain(rows[0] as AgentScheduleRunRow) : null
  }

  async listBySchedule(opts: {
    tenantId: string
    scheduleId: string
    limit?: number
  }): Promise<ScheduleRun[]> {
    const limit = opts.limit ?? 50

    const rows = await this.db
      .select()
      .from(agentScheduleRun)
      .where(
        and(
          eq(agentScheduleRun.tenantId, opts.tenantId),
          eq(agentScheduleRun.scheduleId, opts.scheduleId),
        ),
      )
      .orderBy(desc(agentScheduleRun.startedAt))
      .limit(limit)

    return rows.map((row) => toDomain(row as AgentScheduleRunRow))
  }

  async countTodayBySchedule(opts: { tenantId: string; scheduleId: string }): Promise<number> {
    const now = new Date()
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

    const rows = await this.db
      .select({ total: count() })
      .from(agentScheduleRun)
      .where(
        and(
          eq(agentScheduleRun.tenantId, opts.tenantId),
          eq(agentScheduleRun.scheduleId, opts.scheduleId),
          gte(agentScheduleRun.startedAt, todayUtc),
        ),
      )

    return Number(rows[0]?.total ?? 0)
  }

  async sumTodayCostBySchedule(opts: { tenantId: string; scheduleId: string }): Promise<number> {
    const now = new Date()
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

    const rows = await this.db
      .select({ total: sum(agentScheduleRun.costSpentUsd) })
      .from(agentScheduleRun)
      .where(
        and(
          eq(agentScheduleRun.tenantId, opts.tenantId),
          eq(agentScheduleRun.scheduleId, opts.scheduleId),
          gte(agentScheduleRun.startedAt, todayUtc),
        ),
      )

    return parseFloat(rows[0]?.total ?? '0')
  }
}

export { SCHEDULE_RUN_REPOSITORY }
