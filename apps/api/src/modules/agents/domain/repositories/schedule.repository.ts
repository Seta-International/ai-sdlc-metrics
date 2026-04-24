import type { Schedule } from '../entities/schedule.entity'

export const SCHEDULE_REPOSITORY = Symbol('IScheduleRepository')

export interface IScheduleRepository {
  insert(opts: {
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
  }): Promise<Schedule>

  getById(opts: { tenantId: string; scheduleId: string }): Promise<Schedule | null>

  update(opts: {
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
  }): Promise<void>

  listForUser(opts: { tenantId: string; userId: string }): Promise<Schedule[]>

  listForTenant(opts: { tenantId: string }): Promise<Schedule[]>

  countActiveForTenant(opts: { tenantId: string }): Promise<number>

  bulkPauseForTenant(opts: { tenantId: string; pauseReason: string }): Promise<{ count: number }>

  listPersonalByOwner(opts: { tenantId: string; ownerUserId: string }): Promise<Schedule[]>

  bulkPauseByOwner(opts: {
    tenantId: string
    ownerUserId: string
    pauseReason: string
  }): Promise<{ count: number }>
}
