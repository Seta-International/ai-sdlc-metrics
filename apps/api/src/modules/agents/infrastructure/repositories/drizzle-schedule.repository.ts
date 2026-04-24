import { Inject, Injectable } from '@nestjs/common'
import { and, count, eq, sql } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { agentSchedule } from '../schema/agent-schedule.schema'
import type { AgentScheduleRow } from '../schema/agent-schedule.schema'
import { SCHEDULE_REPOSITORY } from '../../domain/repositories/schedule.repository'
import type { IScheduleRepository } from '../../domain/repositories/schedule.repository'
import type { Schedule } from '../../domain/entities/schedule.entity'

function toDomain(row: AgentScheduleRow): Schedule {
  return {
    id: row.id,
    tenantId: row.tenantId,
    kind: row.kind as Schedule['kind'],
    ownerUserId: row.ownerUserId ?? null,
    createdBy: row.createdBy,
    triggerKind: row.triggerKind as Schedule['triggerKind'],
    cronExpression: row.cronExpression ?? null,
    eventSubscription: row.eventSubscription as Schedule['eventSubscription'],
    prompt: row.prompt,
    delegationId: row.delegationId,
    costCeilingDailyUsd: row.costCeilingDailyUsd as string,
    invocationCeilingDaily: row.invocationCeilingDaily,
    status: row.status as Schedule['status'],
    pauseReason: row.pauseReason ?? null,
    consecutiveFailureCount: row.consecutiveFailureCount,
    failureAlertPolicy: row.failureAlertPolicy as Schedule['failureAlertPolicy'],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

@Injectable()
export class DrizzleScheduleRepository implements IScheduleRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async insert(opts: {
    tenantId: string
    kind: 'personal' | 'tenant_wide'
    ownerUserId?: string
    createdBy: string
    triggerKind: 'cron' | 'event'
    cronExpression?: string
    eventSubscription?: { eventType: string; filter: unknown }
    prompt: string
    delegationId: string
    costCeilingDailyUsd: number
    invocationCeilingDaily: number
    failureAlertPolicy?: string
  }): Promise<Schedule> {
    const rows = await this.db
      .insert(agentSchedule)
      .values({
        tenantId: opts.tenantId,
        kind: opts.kind,
        ownerUserId: opts.ownerUserId ?? null,
        createdBy: opts.createdBy,
        triggerKind: opts.triggerKind,
        cronExpression: opts.cronExpression ?? null,
        eventSubscription: opts.eventSubscription
          ? (opts.eventSubscription as Record<string, unknown>)
          : null,
        prompt: opts.prompt,
        delegationId: opts.delegationId,
        costCeilingDailyUsd: String(opts.costCeilingDailyUsd),
        invocationCeilingDaily: opts.invocationCeilingDaily,
        ...(opts.failureAlertPolicy !== undefined
          ? { failureAlertPolicy: opts.failureAlertPolicy }
          : {}),
      })
      .returning()

    return toDomain(rows[0] as AgentScheduleRow)
  }

  async getById(opts: { tenantId: string; scheduleId: string }): Promise<Schedule | null> {
    const rows = await this.db
      .select()
      .from(agentSchedule)
      .where(and(eq(agentSchedule.tenantId, opts.tenantId), eq(agentSchedule.id, opts.scheduleId)))
      .limit(1)

    return rows[0] ? toDomain(rows[0] as AgentScheduleRow) : null
  }

  async update(opts: {
    tenantId: string
    scheduleId: string
    status?: 'active' | 'paused' | 'deleted'
    pauseReason?: string | null
    consecutiveFailureCount?: number
    prompt?: string
    cronExpression?: string
    costCeilingDailyUsd?: number
    invocationCeilingDaily?: number
    failureAlertPolicy?: string
    updatedAt?: Date
  }): Promise<void> {
    await this.db
      .update(agentSchedule)
      .set({
        ...(opts.status !== undefined ? { status: opts.status } : {}),
        ...(opts.pauseReason !== undefined ? { pauseReason: opts.pauseReason } : {}),
        ...(opts.consecutiveFailureCount !== undefined
          ? { consecutiveFailureCount: opts.consecutiveFailureCount }
          : {}),
        ...(opts.prompt !== undefined ? { prompt: opts.prompt } : {}),
        ...(opts.cronExpression !== undefined ? { cronExpression: opts.cronExpression } : {}),
        ...(opts.costCeilingDailyUsd !== undefined
          ? { costCeilingDailyUsd: String(opts.costCeilingDailyUsd) }
          : {}),
        ...(opts.invocationCeilingDaily !== undefined
          ? { invocationCeilingDaily: opts.invocationCeilingDaily }
          : {}),
        ...(opts.failureAlertPolicy !== undefined
          ? { failureAlertPolicy: opts.failureAlertPolicy }
          : {}),
        updatedAt: opts.updatedAt ?? new Date(),
      })
      .where(and(eq(agentSchedule.tenantId, opts.tenantId), eq(agentSchedule.id, opts.scheduleId)))
  }

  async listForUser(opts: { tenantId: string; userId: string }): Promise<Schedule[]> {
    const rows = await this.db
      .select()
      .from(agentSchedule)
      .where(
        and(eq(agentSchedule.tenantId, opts.tenantId), eq(agentSchedule.ownerUserId, opts.userId)),
      )

    return rows.map((row) => toDomain(row as AgentScheduleRow))
  }

  async listForTenant(opts: { tenantId: string }): Promise<Schedule[]> {
    const rows = await this.db
      .select()
      .from(agentSchedule)
      .where(eq(agentSchedule.tenantId, opts.tenantId))

    return rows.map((row) => toDomain(row as AgentScheduleRow))
  }

  async countActiveForTenant(opts: { tenantId: string }): Promise<number> {
    const rows = await this.db
      .select({ total: count() })
      .from(agentSchedule)
      .where(and(eq(agentSchedule.tenantId, opts.tenantId), eq(agentSchedule.status, 'active')))

    return Number(rows[0]?.total ?? 0)
  }

  async bulkPauseForTenant(opts: {
    tenantId: string
    pauseReason: string
  }): Promise<{ count: number }> {
    const rows = await this.db
      .update(agentSchedule)
      .set({
        status: 'paused',
        pauseReason: opts.pauseReason,
        updatedAt: sql`now()`,
      })
      .where(and(eq(agentSchedule.tenantId, opts.tenantId), eq(agentSchedule.status, 'active')))
      .returning({ id: agentSchedule.id })

    return { count: rows.length }
  }

  async listPersonalByOwner(opts: { tenantId: string; ownerUserId: string }): Promise<Schedule[]> {
    const rows = await this.db
      .select()
      .from(agentSchedule)
      .where(
        and(
          eq(agentSchedule.tenantId, opts.tenantId),
          eq(agentSchedule.kind, 'personal'),
          eq(agentSchedule.ownerUserId, opts.ownerUserId),
        ),
      )

    return rows.map((row) => toDomain(row as AgentScheduleRow))
  }

  async bulkPauseByOwner(opts: {
    tenantId: string
    ownerUserId: string
    pauseReason: string
  }): Promise<{ count: number }> {
    const rows = await this.db
      .update(agentSchedule)
      .set({
        status: 'paused',
        pauseReason: opts.pauseReason,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(agentSchedule.tenantId, opts.tenantId),
          eq(agentSchedule.ownerUserId, opts.ownerUserId),
          eq(agentSchedule.status, 'active'),
        ),
      )
      .returning({ id: agentSchedule.id })

    return { count: rows.length }
  }
}

export { SCHEDULE_REPOSITORY }
