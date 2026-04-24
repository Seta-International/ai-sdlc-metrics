import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Logger } from '@nestjs/common'
import { ScheduleRepository } from './schedule-repository'
import type { IScheduleRepository } from '../../domain/repositories/schedule.repository'
import type { DelegationLifecycle } from './delegation-lifecycle'
import type { KernelDelegationFacade } from '../../../kernel/application/facades/kernel-delegation.facade'
import type { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import type { AgentDelegation } from '../../../kernel/application/facades/kernel-delegation.facade'
import type { Schedule } from '../../domain/entities/schedule.entity'

// ─── Test constants ───────────────────────────────────────────────────────────

const TENANT_ID = '01900000-0000-7fff-8000-000000000001'
const USER_ID = '01900000-0000-7fff-8000-000000000002'
const SCHEDULE_ID = '01900000-0000-7fff-8000-000000000010'
const DELEGATION_ID = '01900000-0000-7fff-8000-000000000020'

function makeFakeSchedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: SCHEDULE_ID,
    tenantId: TENANT_ID,
    kind: 'personal',
    ownerUserId: USER_ID,
    createdBy: USER_ID,
    triggerKind: 'cron',
    cronExpression: '0 * * * *',
    eventSubscription: null,
    prompt: 'daily summary',
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

function makeFakeDelegation(overrides: Partial<AgentDelegation> = {}): AgentDelegation {
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

function makeScheduleRepo(): {
  insert: ReturnType<typeof vi.fn>
  getById: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  listForUser: ReturnType<typeof vi.fn>
  listForTenant: ReturnType<typeof vi.fn>
  countActiveForTenant: ReturnType<typeof vi.fn>
  bulkPauseForTenant: ReturnType<typeof vi.fn>
  listPersonalByOwner: ReturnType<typeof vi.fn>
  bulkPauseByOwner: ReturnType<typeof vi.fn>
} {
  return {
    insert: vi.fn(),
    getById: vi.fn(),
    update: vi.fn(),
    listForUser: vi.fn(),
    listForTenant: vi.fn(),
    countActiveForTenant: vi.fn().mockResolvedValue(0),
    bulkPauseForTenant: vi.fn(),
    listPersonalByOwner: vi.fn(),
    bulkPauseByOwner: vi.fn(),
  }
}

function makeDelegationLifecycle(): {
  create: ReturnType<typeof vi.fn>
  revoke: ReturnType<typeof vi.fn>
  listActive: ReturnType<typeof vi.fn>
  sweepExpired: ReturnType<typeof vi.fn>
  handleUserOffboarding: ReturnType<typeof vi.fn>
} {
  return {
    create: vi.fn(),
    revoke: vi.fn(),
    listActive: vi.fn(),
    sweepExpired: vi.fn(),
    handleUserOffboarding: vi.fn(),
  }
}

function makeKernelDelegationFacade(): {
  createDelegation: ReturnType<typeof vi.fn>
  revokeDelegation: ReturnType<typeof vi.fn>
  getDelegation: ReturnType<typeof vi.fn>
  countActiveByDelegator: ReturnType<typeof vi.fn>
  listActiveByDelegator: ReturnType<typeof vi.fn>
  listActiveForTenant: ReturnType<typeof vi.fn>
  sweepExpired: ReturnType<typeof vi.fn>
  bulkRevokeByDelegator: ReturnType<typeof vi.fn>
} {
  return {
    createDelegation: vi.fn(),
    revokeDelegation: vi.fn(),
    getDelegation: vi.fn(),
    countActiveByDelegator: vi.fn(),
    listActiveByDelegator: vi.fn(),
    listActiveForTenant: vi.fn(),
    sweepExpired: vi.fn(),
    bulkRevokeByDelegator: vi.fn(),
  }
}

function makeKernelAuditFacade(): { recordEvent: ReturnType<typeof vi.fn> } {
  return { recordEvent: vi.fn().mockResolvedValue(undefined) }
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('ScheduleRepository (application service)', () => {
  let scheduleRepo: ReturnType<typeof makeScheduleRepo>
  let delegationLifecycle: ReturnType<typeof makeDelegationLifecycle>
  let kernelDelegationFacade: ReturnType<typeof makeKernelDelegationFacade>
  let kernelAuditFacade: ReturnType<typeof makeKernelAuditFacade>
  let service: ScheduleRepository

  beforeEach(() => {
    scheduleRepo = makeScheduleRepo()
    delegationLifecycle = makeDelegationLifecycle()
    kernelDelegationFacade = makeKernelDelegationFacade()
    kernelAuditFacade = makeKernelAuditFacade()

    // Silence logger output in tests
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)

    service = new ScheduleRepository(
      scheduleRepo as unknown as IScheduleRepository,
      delegationLifecycle as unknown as DelegationLifecycle,
      kernelDelegationFacade as unknown as KernelDelegationFacade,
      kernelAuditFacade as unknown as KernelAuditFacade,
    )
  })

  // ─── create() ────────────────────────────────────────────────────────────────

  describe('create() — personal schedule', () => {
    const baseOpts = {
      tenantId: TENANT_ID,
      createdBy: USER_ID,
      kind: 'personal' as const,
      ownerUserId: USER_ID,
      triggerKind: 'cron' as const,
      cronExpression: '0 * * * *',
      prompt: 'daily summary',
      delegationScope: { permitted_tools: ['planner.listTasks'] },
      costCeilingDailyUsd: 1.0,
      invocationCeilingDaily: 5,
    }

    it('calls DelegationLifecycle.create then IScheduleRepository.insert', async () => {
      const fakeDelegation = makeFakeDelegation()
      const fakeSchedule = makeFakeSchedule()

      delegationLifecycle.create.mockResolvedValue(fakeDelegation)
      scheduleRepo.insert.mockResolvedValue(fakeSchedule)

      const result = await service.create(baseOpts)

      expect(delegationLifecycle.create).toHaveBeenCalledOnce()
      expect(scheduleRepo.insert).toHaveBeenCalledOnce()
      expect(result.schedule).toEqual(fakeSchedule)
      expect(result.delegation).toEqual(fakeDelegation)
    })

    it('passes delegatorUserId=ownerUserId to DelegationLifecycle.create for personal schedule', async () => {
      const fakeDelegation = makeFakeDelegation()
      const fakeSchedule = makeFakeSchedule()

      delegationLifecycle.create.mockResolvedValue(fakeDelegation)
      scheduleRepo.insert.mockResolvedValue(fakeSchedule)

      await service.create(baseOpts)

      expect(delegationLifecycle.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          delegatorUserId: USER_ID,
          delegate: 'agent:scheduler',
        }),
      )
    })

    it('inserts schedule with delegationId from the created delegation', async () => {
      const fakeDelegation = makeFakeDelegation({ id: DELEGATION_ID })
      const fakeSchedule = makeFakeSchedule()

      delegationLifecycle.create.mockResolvedValue(fakeDelegation)
      scheduleRepo.insert.mockResolvedValue(fakeSchedule)

      await service.create(baseOpts)

      expect(scheduleRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          delegationId: DELEGATION_ID,
        }),
      )
    })

    it('does NOT call insert before create returns (sequential, not concurrent)', async () => {
      let delegationCreated = false
      const fakeDelegation = makeFakeDelegation()
      const fakeSchedule = makeFakeSchedule()

      delegationLifecycle.create.mockImplementation(async () => {
        delegationCreated = true
        return fakeDelegation
      })
      scheduleRepo.insert.mockImplementation(async () => {
        expect(delegationCreated).toBe(true)
        return fakeSchedule
      })

      await service.create(baseOpts)

      expect(scheduleRepo.insert).toHaveBeenCalledOnce()
    })
  })

  describe('create() — tenant_wide schedule', () => {
    const baseOpts = {
      tenantId: TENANT_ID,
      createdBy: USER_ID,
      kind: 'tenant_wide' as const,
      triggerKind: 'cron' as const,
      cronExpression: '0 0 * * *',
      prompt: 'nightly report',
      delegationScope: {},
      costCeilingDailyUsd: 5.0,
      invocationCeilingDaily: 10,
    }

    it('passes delegatorUserId=undefined to DelegationLifecycle.create for tenant_wide', async () => {
      const fakeDelegation = makeFakeDelegation({ delegatorUserId: null })
      const fakeSchedule = makeFakeSchedule({ kind: 'tenant_wide', ownerUserId: null })

      delegationLifecycle.create.mockResolvedValue(fakeDelegation)
      scheduleRepo.insert.mockResolvedValue(fakeSchedule)

      await service.create(baseOpts)

      const createCall = delegationLifecycle.create.mock.calls[0][0]
      expect(createCall.delegatorUserId).toBeUndefined()
    })
  })

  // ─── pause() ─────────────────────────────────────────────────────────────────

  describe('pause()', () => {
    it('calls IScheduleRepository.update with status=paused and default reason', async () => {
      scheduleRepo.update.mockResolvedValue(undefined)

      await service.pause({ tenantId: TENANT_ID, scheduleId: SCHEDULE_ID })

      expect(scheduleRepo.update).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        scheduleId: SCHEDULE_ID,
        status: 'paused',
        pauseReason: 'owner_requested',
      })
    })

    it('uses provided reason when specified', async () => {
      scheduleRepo.update.mockResolvedValue(undefined)

      await service.pause({
        tenantId: TENANT_ID,
        scheduleId: SCHEDULE_ID,
        reason: 'budget_exceeded',
      })

      expect(scheduleRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'paused',
          pauseReason: 'budget_exceeded',
        }),
      )
    })
  })

  // ─── resume() ────────────────────────────────────────────────────────────────

  describe('resume()', () => {
    it('calls IScheduleRepository.update with status=active and pauseReason=null', async () => {
      scheduleRepo.update.mockResolvedValue(undefined)

      await service.resume({ tenantId: TENANT_ID, scheduleId: SCHEDULE_ID })

      expect(scheduleRepo.update).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        scheduleId: SCHEDULE_ID,
        status: 'active',
        pauseReason: null,
      })
    })
  })

  // ─── delete() ────────────────────────────────────────────────────────────────

  describe('delete()', () => {
    it('calls IScheduleRepository.update with status=deleted', async () => {
      scheduleRepo.getById.mockResolvedValue(makeFakeSchedule())
      scheduleRepo.update.mockResolvedValue(undefined)
      delegationLifecycle.revoke.mockResolvedValue(undefined)

      await service.delete({ tenantId: TENANT_ID, scheduleId: SCHEDULE_ID })

      expect(scheduleRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          scheduleId: SCHEDULE_ID,
          status: 'deleted',
        }),
      )
    })

    it('calls DelegationLifecycle.revoke after updating status', async () => {
      const fakeSchedule = makeFakeSchedule({ delegationId: DELEGATION_ID })
      scheduleRepo.getById.mockResolvedValue(fakeSchedule)
      scheduleRepo.update.mockResolvedValue(undefined)
      delegationLifecycle.revoke.mockResolvedValue(undefined)

      await service.delete({ tenantId: TENANT_ID, scheduleId: SCHEDULE_ID })

      expect(delegationLifecycle.revoke).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          delegationId: DELEGATION_ID,
        }),
      )
    })
  })

  // ─── listForUser() ────────────────────────────────────────────────────────────

  describe('listForUser()', () => {
    it('delegates to IScheduleRepository.listForUser', async () => {
      const schedules = [makeFakeSchedule()]
      scheduleRepo.listForUser.mockResolvedValue(schedules)

      const result = await service.listForUser({ tenantId: TENANT_ID, userId: USER_ID })

      expect(scheduleRepo.listForUser).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        userId: USER_ID,
      })
      expect(result).toEqual(schedules)
    })
  })

  // ─── listForTenant() ──────────────────────────────────────────────────────────

  describe('listForTenant()', () => {
    it('delegates to IScheduleRepository.listForTenant', async () => {
      const schedules = [makeFakeSchedule(), makeFakeSchedule({ id: 'other-id' })]
      scheduleRepo.listForTenant.mockResolvedValue(schedules)

      const result = await service.listForTenant({ tenantId: TENANT_ID })

      expect(scheduleRepo.listForTenant).toHaveBeenCalledWith({ tenantId: TENANT_ID })
      expect(result).toEqual(schedules)
    })
  })

  // ─── audit events ─────────────────────────────────────────────────────────────

  describe('audit events', () => {
    it('create() emits agent.schedule_created audit', async () => {
      const fakeDelegation = makeFakeDelegation()
      const fakeSchedule = makeFakeSchedule()

      delegationLifecycle.create.mockResolvedValue(fakeDelegation)
      scheduleRepo.insert.mockResolvedValue(fakeSchedule)

      await service.create({
        tenantId: TENANT_ID,
        createdBy: USER_ID,
        kind: 'personal',
        ownerUserId: USER_ID,
        triggerKind: 'cron',
        cronExpression: '0 * * * *',
        prompt: 'daily summary',
        delegationScope: {},
        costCeilingDailyUsd: 1.0,
        invocationCeilingDaily: 5,
      })

      expect(kernelAuditFacade.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'agent.schedule_created' }),
      )
    })

    it('pause() emits agent.schedule_paused audit', async () => {
      scheduleRepo.update.mockResolvedValue(undefined)

      await service.pause({ tenantId: TENANT_ID, scheduleId: SCHEDULE_ID })

      expect(kernelAuditFacade.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'agent.schedule_paused' }),
      )
    })

    it('resume() emits agent.schedule_resumed audit', async () => {
      scheduleRepo.update.mockResolvedValue(undefined)

      await service.resume({ tenantId: TENANT_ID, scheduleId: SCHEDULE_ID })

      expect(kernelAuditFacade.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'agent.schedule_resumed' }),
      )
    })

    it('delete() emits agent.schedule_deleted audit', async () => {
      scheduleRepo.getById.mockResolvedValue(makeFakeSchedule())
      scheduleRepo.update.mockResolvedValue(undefined)
      delegationLifecycle.revoke.mockResolvedValue(undefined)

      await service.delete({ tenantId: TENANT_ID, scheduleId: SCHEDULE_ID })

      expect(kernelAuditFacade.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'agent.schedule_deleted' }),
      )
    })
  })

  // ─── tenant cap ───────────────────────────────────────────────────────────────

  describe('tenant active-schedule cap', () => {
    const baseCreateOpts = {
      tenantId: TENANT_ID,
      createdBy: USER_ID,
      kind: 'personal' as const,
      ownerUserId: USER_ID,
      triggerKind: 'cron' as const,
      cronExpression: '0 * * * *',
      prompt: 'daily summary',
      delegationScope: {},
      costCeilingDailyUsd: 1.0,
      invocationCeilingDaily: 5,
    }

    it('throws tenant_schedule_cap_exceeded when at 100 active schedules', async () => {
      scheduleRepo.countActiveForTenant.mockResolvedValue(100)

      await expect(service.create(baseCreateOpts)).rejects.toThrow('tenant_schedule_cap_exceeded')

      expect(delegationLifecycle.create).not.toHaveBeenCalled()
    })

    it('logs a warning when at 80% of cap (80 active schedules)', async () => {
      const warnSpy = vi.spyOn(Logger.prototype, 'warn')
      scheduleRepo.countActiveForTenant.mockResolvedValue(80)
      delegationLifecycle.create.mockResolvedValue(makeFakeDelegation())
      scheduleRepo.insert.mockResolvedValue(makeFakeSchedule())

      await service.create(baseCreateOpts)

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('approaching active schedule cap'),
      )
    })

    it('succeeds when under cap', async () => {
      scheduleRepo.countActiveForTenant.mockResolvedValue(50)
      delegationLifecycle.create.mockResolvedValue(makeFakeDelegation())
      scheduleRepo.insert.mockResolvedValue(makeFakeSchedule())

      const result = await service.create(baseCreateOpts)

      expect(result.schedule).toBeDefined()
    })
  })

  // ─── update() ─────────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('calls IScheduleRepository.update with provided fields', async () => {
      scheduleRepo.update.mockResolvedValue(undefined)

      await service.update({
        tenantId: TENANT_ID,
        scheduleId: SCHEDULE_ID,
        prompt: 'new prompt',
        costCeilingDailyUsd: 2.5,
        failureAlertPolicy: 'silent',
      })

      expect(scheduleRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          scheduleId: SCHEDULE_ID,
          prompt: 'new prompt',
          costCeilingDailyUsd: 2.5,
          failureAlertPolicy: 'silent',
        }),
      )
    })
  })

  // ─── failureAlertPolicy forwarding ────────────────────────────────────────────

  describe('create() — failureAlertPolicy forwarding', () => {
    it('forwards failureAlertPolicy to IScheduleRepository.insert', async () => {
      const fakeDelegation = makeFakeDelegation()
      const fakeSchedule = makeFakeSchedule()

      delegationLifecycle.create.mockResolvedValue(fakeDelegation)
      scheduleRepo.insert.mockResolvedValue(fakeSchedule)

      await service.create({
        tenantId: TENANT_ID,
        createdBy: USER_ID,
        kind: 'personal',
        ownerUserId: USER_ID,
        triggerKind: 'cron',
        cronExpression: '0 * * * *',
        prompt: 'daily summary',
        delegationScope: {},
        costCeilingDailyUsd: 1.0,
        invocationCeilingDaily: 5,
        failureAlertPolicy: 'admin_only',
      })

      expect(scheduleRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ failureAlertPolicy: 'admin_only' }),
      )
    })
  })
})
