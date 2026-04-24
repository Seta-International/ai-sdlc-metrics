import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Logger } from '@nestjs/common'
import { ScheduledTurnSpawner } from './scheduled-turn-spawner'
import type { IScheduleRunRepository } from '../../domain/repositories/schedule-run.repository'
import type { KernelDelegationFacade } from '../../../kernel/application/facades/kernel-delegation.facade'
import type { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import type { TaintSeedDetector } from './taint-seed-detector'
import type { SchedulerPrincipal } from './scheduler-principal'
import type { PgBossService } from '../../../../common/jobs/pg-boss.service'
import type { Schedule } from '../../domain/entities/schedule.entity'
import type { AgentDelegation } from '../../../kernel/application/facades/kernel-delegation.facade'

// ─── Test constants ───────────────────────────────────────────────────────────

const TENANT_ID = '01900000-0000-7fff-8000-000000000001'
const USER_ID = '01900000-0000-7fff-8000-000000000002'
const SCHEDULE_ID = '01900000-0000-7fff-8000-000000000003'
const DELEGATION_ID = '01900000-0000-7fff-8000-000000000004'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeActiveSchedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: SCHEDULE_ID,
    tenantId: TENANT_ID,
    kind: 'personal',
    ownerUserId: USER_ID,
    createdBy: USER_ID,
    triggerKind: 'cron',
    cronExpression: '0 9 * * *',
    eventSubscription: null,
    prompt: 'Summarise today tasks',
    delegationId: DELEGATION_ID,
    costCeilingDailyUsd: '1.00',
    invocationCeilingDaily: 5,
    status: 'active',
    pauseReason: null,
    consecutiveFailureCount: 0,
    failureAlertPolicy: 'owner',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeActiveDelegation(overrides: Partial<AgentDelegation> = {}): AgentDelegation {
  return {
    id: DELEGATION_ID,
    tenantId: TENANT_ID,
    delegatorUserId: USER_ID,
    delegate: 'agent:scheduler',
    scope: {},
    expiresAt: new Date(Date.now() + 7 * 24 * 3600_000),
    status: 'active',
    autonomousWritesAllowed: false,
    createdAt: new Date(),
    ...overrides,
  }
}

// ─── Mock factories ───────────────────────────────────────────────────────────

function makeScheduleRunRepo(): jest.Mocked<
  Pick<
    IScheduleRunRepository,
    | 'insert'
    | 'countTodayBySchedule'
    | 'sumTodayCostBySchedule'
    | 'updateOutcome'
    | 'getById'
    | 'getByTraceId'
    | 'listBySchedule'
  >
> {
  return {
    insert: vi.fn(),
    updateOutcome: vi.fn(),
    getById: vi.fn(),
    getByTraceId: vi.fn(),
    listBySchedule: vi.fn(),
    countTodayBySchedule: vi.fn(),
    sumTodayCostBySchedule: vi.fn(),
  }
}

function makeDelegationFacade(): { getDelegation: ReturnType<typeof vi.fn> } {
  return { getDelegation: vi.fn() }
}

function makeAuditFacade(): { recordEvent: ReturnType<typeof vi.fn> } {
  return { recordEvent: vi.fn().mockResolvedValue(undefined) }
}

function makeTaintSeedDetector(): { shouldSeedTaint: ReturnType<typeof vi.fn> } {
  return { shouldSeedTaint: vi.fn().mockReturnValue(false) }
}

function makeSchedulerPrincipal(): { resolve: ReturnType<typeof vi.fn> } {
  return {
    resolve: vi.fn().mockReturnValue({
      actorPrincipal: 'user',
      userOnBehalfOf: USER_ID,
      delegationId: DELEGATION_ID,
      canDoBasis: 'delegator',
    }),
  }
}

function makePgBossService(): { enqueue: ReturnType<typeof vi.fn> } {
  return { enqueue: vi.fn().mockResolvedValue('job-id-123') }
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('ScheduledTurnSpawner', () => {
  let scheduleRunRepo: ReturnType<typeof makeScheduleRunRepo>
  let delegationFacade: ReturnType<typeof makeDelegationFacade>
  let auditFacade: ReturnType<typeof makeAuditFacade>
  let taintSeedDetector: ReturnType<typeof makeTaintSeedDetector>
  let schedulerPrincipal: ReturnType<typeof makeSchedulerPrincipal>
  let pgBossService: ReturnType<typeof makePgBossService>
  let spawner: ScheduledTurnSpawner

  beforeEach(() => {
    scheduleRunRepo = makeScheduleRunRepo()
    delegationFacade = makeDelegationFacade()
    auditFacade = makeAuditFacade()
    taintSeedDetector = makeTaintSeedDetector()
    schedulerPrincipal = makeSchedulerPrincipal()
    pgBossService = makePgBossService()

    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)

    spawner = new ScheduledTurnSpawner(
      scheduleRunRepo as unknown as IScheduleRunRepository,
      delegationFacade as unknown as KernelDelegationFacade,
      taintSeedDetector as unknown as TaintSeedDetector,
      schedulerPrincipal as unknown as SchedulerPrincipal,
      pgBossService as unknown as PgBossService,
      auditFacade as unknown as KernelAuditFacade,
    )
  })

  // ─── 1. Happy path cron ───────────────────────────────────────────────────────

  describe('happy path — cron trigger', () => {
    it('enqueues a job and returns { spawned: true }', async () => {
      const schedule = makeActiveSchedule()
      delegationFacade.getDelegation.mockResolvedValue(makeActiveDelegation())
      scheduleRunRepo.countTodayBySchedule.mockResolvedValue(0)
      scheduleRunRepo.sumTodayCostBySchedule.mockResolvedValue(0)

      const result = await spawner.spawn({ schedule, firedBy: 'cron' })

      expect(result).toEqual({ spawned: true })
      expect(pgBossService.enqueue).toHaveBeenCalledOnce()
      expect(pgBossService.enqueue).toHaveBeenCalledWith(
        'agent.scheduled-turn',
        expect.objectContaining({
          tenant_id: TENANT_ID,
          schedule_id: SCHEDULE_ID,
          delegation_id: DELEGATION_ID,
          fired_by: 'cron',
          taint_seeded: false,
        }),
      )
    })

    it('records an audit event on success', async () => {
      const schedule = makeActiveSchedule()
      delegationFacade.getDelegation.mockResolvedValue(makeActiveDelegation())
      scheduleRunRepo.countTodayBySchedule.mockResolvedValue(0)
      scheduleRunRepo.sumTodayCostBySchedule.mockResolvedValue(0)

      await spawner.spawn({ schedule, firedBy: 'cron' })

      expect(auditFacade.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          eventType: 'agent.schedule_run_started',
          module: 'agents',
          subjectId: SCHEDULE_ID,
        }),
      )
    })
  })

  // ─── 2. Schedule paused ───────────────────────────────────────────────────────

  it('returns { spawned: false, reason: "paused" } when schedule status is paused', async () => {
    const schedule = makeActiveSchedule({ status: 'paused' })

    const result = await spawner.spawn({ schedule, firedBy: 'cron' })

    expect(result).toEqual({ spawned: false, reason: 'paused' })
    expect(pgBossService.enqueue).not.toHaveBeenCalled()
    expect(delegationFacade.getDelegation).not.toHaveBeenCalled()
  })

  // ─── 3. Schedule deleted ──────────────────────────────────────────────────────

  it('returns { spawned: false, reason: "paused" } when schedule status is deleted', async () => {
    const schedule = makeActiveSchedule({ status: 'deleted' })

    const result = await spawner.spawn({ schedule, firedBy: 'cron' })

    expect(result).toEqual({ spawned: false, reason: 'paused' })
    expect(pgBossService.enqueue).not.toHaveBeenCalled()
  })

  // ─── 4. Delegation expired ────────────────────────────────────────────────────

  it('returns { spawned: false, reason: "delegation_expired" } when delegation status is revoked', async () => {
    const schedule = makeActiveSchedule()
    delegationFacade.getDelegation.mockResolvedValue(makeActiveDelegation({ status: 'revoked' }))

    const result = await spawner.spawn({ schedule, firedBy: 'cron' })

    expect(result).toEqual({ spawned: false, reason: 'delegation_expired' })
    expect(pgBossService.enqueue).not.toHaveBeenCalled()
  })

  it('returns { spawned: false, reason: "delegation_expired" } when delegation status is expired', async () => {
    const schedule = makeActiveSchedule()
    delegationFacade.getDelegation.mockResolvedValue(makeActiveDelegation({ status: 'expired' }))

    const result = await spawner.spawn({ schedule, firedBy: 'cron' })

    expect(result).toEqual({ spawned: false, reason: 'delegation_expired' })
    expect(pgBossService.enqueue).not.toHaveBeenCalled()
  })

  // ─── 5. Delegation null ───────────────────────────────────────────────────────

  it('returns { spawned: false, reason: "delegation_expired" } when delegation not found', async () => {
    const schedule = makeActiveSchedule()
    delegationFacade.getDelegation.mockResolvedValue(null)

    const result = await spawner.spawn({ schedule, firedBy: 'cron' })

    expect(result).toEqual({ spawned: false, reason: 'delegation_expired' })
    expect(pgBossService.enqueue).not.toHaveBeenCalled()
  })

  // ─── 6. Invocation ceiling exhausted ─────────────────────────────────────────

  it('returns { spawned: false, reason: "ceiling_exhausted" } when invocation ceiling reached', async () => {
    const schedule = makeActiveSchedule({ invocationCeilingDaily: 3 })
    delegationFacade.getDelegation.mockResolvedValue(makeActiveDelegation())
    scheduleRunRepo.countTodayBySchedule.mockResolvedValue(3)

    const result = await spawner.spawn({ schedule, firedBy: 'cron' })

    expect(result).toEqual({ spawned: false, reason: 'ceiling_exhausted' })
    expect(pgBossService.enqueue).not.toHaveBeenCalled()
  })

  // ─── 7. Cost ceiling exhausted ───────────────────────────────────────────────

  it('returns { spawned: false, reason: "ceiling_exhausted" } when cost ceiling reached', async () => {
    const schedule = makeActiveSchedule({ costCeilingDailyUsd: '2.00' })
    delegationFacade.getDelegation.mockResolvedValue(makeActiveDelegation())
    scheduleRunRepo.countTodayBySchedule.mockResolvedValue(0)
    scheduleRunRepo.sumTodayCostBySchedule.mockResolvedValue(2.0)

    const result = await spawner.spawn({ schedule, firedBy: 'cron' })

    expect(result).toEqual({ spawned: false, reason: 'ceiling_exhausted' })
    expect(pgBossService.enqueue).not.toHaveBeenCalled()
  })

  // ─── 8. Event-triggered with taint ───────────────────────────────────────────

  it('enqueues with taintSeeded=true when TaintSeedDetector returns true', async () => {
    const schedule = makeActiveSchedule({ triggerKind: 'event' })
    delegationFacade.getDelegation.mockResolvedValue(makeActiveDelegation())
    scheduleRunRepo.countTodayBySchedule.mockResolvedValue(0)
    scheduleRunRepo.sumTodayCostBySchedule.mockResolvedValue(0)
    taintSeedDetector.shouldSeedTaint.mockReturnValue(true)

    const eventPayload = { message: 'user wrote something' }

    const result = await spawner.spawn({
      schedule,
      firedBy: 'event:planner.task.comment',
      eventPayload,
    })

    expect(result).toEqual({ spawned: true })
    expect(pgBossService.enqueue).toHaveBeenCalledWith(
      'agent.scheduled-turn',
      expect.objectContaining({ taint_seeded: true }),
    )
  })

  // ─── 9. Verify pg-boss payload fields ─────────────────────────────────────────

  it('enqueues a job with all required payload fields', async () => {
    const schedule = makeActiveSchedule()
    delegationFacade.getDelegation.mockResolvedValue(makeActiveDelegation())
    scheduleRunRepo.countTodayBySchedule.mockResolvedValue(1)
    scheduleRunRepo.sumTodayCostBySchedule.mockResolvedValue(0.05)
    schedulerPrincipal.resolve.mockReturnValue({
      actorPrincipal: 'user',
      userOnBehalfOf: USER_ID,
      delegationId: DELEGATION_ID,
      canDoBasis: 'delegator',
    })

    await spawner.spawn({ schedule, firedBy: 'cron' })

    const payload = pgBossService.enqueue.mock.calls[0][1]

    expect(payload).toMatchObject({
      tenant_id: TENANT_ID,
      user_on_behalf_of: USER_ID,
      actor_principal: 'user',
      schedule_id: SCHEDULE_ID,
      delegation_id: DELEGATION_ID,
      taint_seeded: false,
      fired_by: 'cron',
      pinned_versions: {
        router_version: expect.any(String),
        sub_agent_version: expect.any(String),
        tool_meta_version: expect.any(String),
        model_id: expect.any(String),
      },
    })
    // flow_id must be a UUID string
    expect(typeof payload.flow_id).toBe('string')
    expect(payload.flow_id.length).toBeGreaterThan(0)
    // ceiling fields present
    expect(typeof payload.cost_ceiling_remaining_usd).toBe('number')
    expect(typeof payload.invocation_ceiling_remaining).toBe('number')
  })

  // ─── Ceiling remaining values ─────────────────────────────────────────────────

  it('computes correct cost_ceiling_remaining_usd in payload', async () => {
    const schedule = makeActiveSchedule({ costCeilingDailyUsd: '5.00' })
    delegationFacade.getDelegation.mockResolvedValue(makeActiveDelegation())
    scheduleRunRepo.countTodayBySchedule.mockResolvedValue(0)
    scheduleRunRepo.sumTodayCostBySchedule.mockResolvedValue(1.5)

    await spawner.spawn({ schedule, firedBy: 'cron' })

    const payload = pgBossService.enqueue.mock.calls[0][1]
    expect(payload.cost_ceiling_remaining_usd).toBeCloseTo(3.5)
  })

  it('computes correct invocation_ceiling_remaining in payload', async () => {
    const schedule = makeActiveSchedule({ invocationCeilingDaily: 10 })
    delegationFacade.getDelegation.mockResolvedValue(makeActiveDelegation())
    scheduleRunRepo.countTodayBySchedule.mockResolvedValue(4)
    scheduleRunRepo.sumTodayCostBySchedule.mockResolvedValue(0)

    await spawner.spawn({ schedule, firedBy: 'cron' })

    const payload = pgBossService.enqueue.mock.calls[0][1]
    expect(payload.invocation_ceiling_remaining).toBe(6)
  })
})
