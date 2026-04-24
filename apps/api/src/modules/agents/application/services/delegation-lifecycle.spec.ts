import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Logger } from '@nestjs/common'
import { DelegationLifecycle } from './delegation-lifecycle'
import type { IScheduleRepository } from '../../domain/repositories/schedule.repository'
import type { RateLimiter } from './rate-limiter'
import type { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import type {
  KernelDelegationFacade,
  AgentDelegation,
} from '../../../kernel/application/facades/kernel-delegation.facade'
import type { NotificationsWriteFacade } from '../../../notifications/application/facades/notifications-write.facade'
import type { ToolRegistry } from '../../infrastructure/tool-registry/tool-registry'

// ─── Test constants ─────────────────────────────────────────────────────────────

const TENANT_ID = '01900000-0000-7fff-8000-000000000001'
const USER_ID = '01900000-0000-7fff-8000-000000000002'
const ACTOR_ID = '01900000-0000-7fff-8000-000000000003'
const DELEGATION_ID = '01900000-0000-7fff-8000-000000000004'

function makeFakeDelegation(overrides: Partial<AgentDelegation> = {}): AgentDelegation {
  return {
    id: DELEGATION_ID,
    tenantId: TENANT_ID,
    delegatorUserId: USER_ID,
    delegate: 'agent:scheduler',
    scope: { permitted_tools: ['planner.listTasks'] },
    expiresAt: new Date(Date.now() + 7 * 24 * 3600_000),
    status: 'active',
    autonomousWritesAllowed: false,
    createdAt: new Date(),
    ...overrides,
  }
}

// ─── Mock factories ──────────────────────────────────────────────────────────────

function makeDelegationFacade(): {
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
    countActiveForTenant: vi.fn(),
    bulkPauseForTenant: vi.fn(),
    listPersonalByOwner: vi.fn(),
    bulkPauseByOwner: vi.fn(),
  }
}

function makeRateLimiter(): { check: ReturnType<typeof vi.fn> } {
  return { check: vi.fn() }
}

function makeAuditFacade(): { recordEvent: ReturnType<typeof vi.fn> } {
  return { recordEvent: vi.fn() }
}

function makeNotificationsFacade(): { sendDraftApprovalNotification: ReturnType<typeof vi.fn> } {
  return { sendDraftApprovalNotification: vi.fn() }
}

function makeToolRegistry(): { listAgentTools: ReturnType<typeof vi.fn> } {
  return { listAgentTools: vi.fn() }
}

// ─── Test suite ──────────────────────────────────────────────────────────────────

describe('DelegationLifecycle', () => {
  let delegationFacade: ReturnType<typeof makeDelegationFacade>
  let scheduleRepo: ReturnType<typeof makeScheduleRepo>
  let rateLimiter: ReturnType<typeof makeRateLimiter>
  let auditFacade: ReturnType<typeof makeAuditFacade>
  let notificationsFacade: ReturnType<typeof makeNotificationsFacade>
  let toolRegistry: ReturnType<typeof makeToolRegistry>
  let service: DelegationLifecycle

  beforeEach(() => {
    delegationFacade = makeDelegationFacade()
    scheduleRepo = makeScheduleRepo()
    rateLimiter = makeRateLimiter()
    auditFacade = makeAuditFacade()
    notificationsFacade = makeNotificationsFacade()
    toolRegistry = makeToolRegistry()

    // Silence logger output in tests
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)

    service = new DelegationLifecycle(
      scheduleRepo as unknown as IScheduleRepository,
      rateLimiter as unknown as RateLimiter,
      auditFacade as unknown as KernelAuditFacade,
      delegationFacade as unknown as KernelDelegationFacade,
      notificationsFacade as unknown as NotificationsWriteFacade,
      toolRegistry as unknown as ToolRegistry,
    )
  })

  // ─── create() ─────────────────────────────────────────────────────────────────

  describe('create() — personal delegation (delegatorUserId provided)', () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600_000) // 7 days from now
    const baseOpts = {
      tenantId: TENANT_ID,
      delegatorUserId: USER_ID,
      delegate: 'agent:scheduler',
      scope: { permitted_tools: ['planner.listTasks'] },
      expiresAt,
    }

    it('happy path — inserts delegation and returns full entity', async () => {
      rateLimiter.check.mockResolvedValue({ allowed: true })
      delegationFacade.countActiveByDelegator.mockResolvedValue(3)
      delegationFacade.createDelegation.mockResolvedValue({ id: DELEGATION_ID })
      const fakeDelegation = makeFakeDelegation({ expiresAt })
      delegationFacade.getDelegation.mockResolvedValue(fakeDelegation)
      auditFacade.recordEvent.mockResolvedValue(undefined)
      toolRegistry.listAgentTools.mockReturnValue([{ name: 'planner.listTasks' }])

      const result = await service.create(baseOpts)

      expect(delegationFacade.createDelegation).toHaveBeenCalledOnce()
      expect(delegationFacade.getDelegation).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        delegationId: DELEGATION_ID,
      })
      expect(result).toEqual(fakeDelegation)
    })

    it('checks rate limit before inserting', async () => {
      rateLimiter.check.mockResolvedValue({ allowed: true })
      delegationFacade.countActiveByDelegator.mockResolvedValue(0)
      delegationFacade.createDelegation.mockResolvedValue({ id: DELEGATION_ID })
      delegationFacade.getDelegation.mockResolvedValue(makeFakeDelegation())
      auditFacade.recordEvent.mockResolvedValue(undefined)
      toolRegistry.listAgentTools.mockReturnValue([{ name: 'planner.listTasks' }])

      await service.create(baseOpts)

      expect(rateLimiter.check).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        userId: USER_ID,
        limitKey: 'schedule_creations/user/day',
      })
    })

    it('emits audit agent.delegation_created on success', async () => {
      rateLimiter.check.mockResolvedValue({ allowed: true })
      delegationFacade.countActiveByDelegator.mockResolvedValue(0)
      delegationFacade.createDelegation.mockResolvedValue({ id: DELEGATION_ID })
      delegationFacade.getDelegation.mockResolvedValue(makeFakeDelegation())
      auditFacade.recordEvent.mockResolvedValue(undefined)
      toolRegistry.listAgentTools.mockReturnValue([{ name: 'planner.listTasks' }])

      await service.create(baseOpts)

      expect(auditFacade.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'agent.delegation_created' }),
      )
    })
  })

  describe('create() — tenant-wide delegation (no delegatorUserId)', () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600_000)
    const baseOpts = {
      tenantId: TENANT_ID,
      delegate: 'agent:scheduler',
      scope: { permitted_tools: ['planner.listTasks'] },
      expiresAt,
    }

    it('happy path — skips rate limit and max-active checks', async () => {
      delegationFacade.createDelegation.mockResolvedValue({ id: DELEGATION_ID })
      delegationFacade.getDelegation.mockResolvedValue(
        makeFakeDelegation({ delegatorUserId: null }),
      )
      auditFacade.recordEvent.mockResolvedValue(undefined)
      toolRegistry.listAgentTools.mockReturnValue([{ name: 'planner.listTasks' }])

      const result = await service.create(baseOpts)

      expect(rateLimiter.check).not.toHaveBeenCalled()
      expect(delegationFacade.countActiveByDelegator).not.toHaveBeenCalled()
      expect(delegationFacade.createDelegation).toHaveBeenCalledOnce()
      expect(result).toBeDefined()
    })
  })

  describe('create() — rate limit exceeded', () => {
    it('throws Error("rate_limited") when rate limit is not allowed', async () => {
      rateLimiter.check.mockResolvedValue({ allowed: false, remaining: 0 })

      await expect(
        service.create({
          tenantId: TENANT_ID,
          delegatorUserId: USER_ID,
          delegate: 'agent:scheduler',
          scope: {},
          expiresAt: new Date(Date.now() + 3600_000),
        }),
      ).rejects.toThrow('rate_limited')

      expect(delegationFacade.createDelegation).not.toHaveBeenCalled()
    })
  })

  describe('create() — max-active exceeded', () => {
    it('throws Error("max_active_exceeded") when 10 or more delegations exist', async () => {
      rateLimiter.check.mockResolvedValue({ allowed: true })
      delegationFacade.countActiveByDelegator.mockResolvedValue(10)

      await expect(
        service.create({
          tenantId: TENANT_ID,
          delegatorUserId: USER_ID,
          delegate: 'agent:scheduler',
          scope: {},
          expiresAt: new Date(Date.now() + 3600_000),
        }),
      ).rejects.toThrow('max_active_exceeded')

      expect(delegationFacade.createDelegation).not.toHaveBeenCalled()
    })
  })

  describe('create() — 180d cap on expiresAt', () => {
    it('caps expiresAt to 180 days from now when requested expiry exceeds 180d', async () => {
      rateLimiter.check.mockResolvedValue({ allowed: true })
      delegationFacade.countActiveByDelegator.mockResolvedValue(0)
      delegationFacade.createDelegation.mockResolvedValue({ id: DELEGATION_ID })
      delegationFacade.getDelegation.mockResolvedValue(makeFakeDelegation())
      auditFacade.recordEvent.mockResolvedValue(undefined)
      toolRegistry.listAgentTools.mockReturnValue([])

      const farFuture = new Date(Date.now() + 400 * 24 * 3600_000) // 400 days

      await service.create({
        tenantId: TENANT_ID,
        delegatorUserId: USER_ID,
        delegate: 'agent:scheduler',
        scope: {},
        expiresAt: farFuture,
      })

      const insertCall = delegationFacade.createDelegation.mock.calls[0][0]
      const maxAllowed = new Date(Date.now() + 180 * 24 * 3600_000)
      // The effective expiresAt must be <= 180d from now (with a 1s tolerance for test execution)
      expect(insertCall.expiresAt.getTime()).toBeLessThanOrEqual(maxAllowed.getTime() + 1000)
      expect(insertCall.expiresAt.getTime()).toBeLessThan(farFuture.getTime())
    })
  })

  describe('create() — tool drift', () => {
    it('logs a warning and narrows scope when an unknown tool is referenced', async () => {
      rateLimiter.check.mockResolvedValue({ allowed: true })
      delegationFacade.countActiveByDelegator.mockResolvedValue(0)
      delegationFacade.createDelegation.mockResolvedValue({ id: DELEGATION_ID })
      delegationFacade.getDelegation.mockResolvedValue(makeFakeDelegation())
      auditFacade.recordEvent.mockResolvedValue(undefined)
      // Registry only knows 'planner.listTasks', not 'unknown.tool'
      toolRegistry.listAgentTools.mockReturnValue([{ name: 'planner.listTasks' }])

      const warnSpy = vi.spyOn(Logger.prototype, 'warn')

      await service.create({
        tenantId: TENANT_ID,
        delegatorUserId: USER_ID,
        delegate: 'agent:scheduler',
        scope: { permitted_tools: ['planner.listTasks', 'unknown.tool'] },
        expiresAt: new Date(Date.now() + 3600_000),
      })

      // Warning logged for unknown tool
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('unknown.tool'))

      // Scope narrowed to only known tools
      const insertCall = delegationFacade.createDelegation.mock.calls[0][0]
      expect(insertCall.scope.permitted_tools).toEqual(['planner.listTasks'])

      // Drift audit emitted
      expect(auditFacade.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'agent.delegation_tool_drift' }),
      )
    })

    it('creation still succeeds (does not throw) when drift is detected', async () => {
      rateLimiter.check.mockResolvedValue({ allowed: true })
      delegationFacade.countActiveByDelegator.mockResolvedValue(0)
      delegationFacade.createDelegation.mockResolvedValue({ id: DELEGATION_ID })
      delegationFacade.getDelegation.mockResolvedValue(makeFakeDelegation())
      auditFacade.recordEvent.mockResolvedValue(undefined)
      toolRegistry.listAgentTools.mockReturnValue([])

      await expect(
        service.create({
          tenantId: TENANT_ID,
          delegatorUserId: USER_ID,
          delegate: 'agent:scheduler',
          scope: { permitted_tools: ['nonexistent.tool'] },
          expiresAt: new Date(Date.now() + 3600_000),
        }),
      ).resolves.toBeDefined()
    })
  })

  // ─── revoke() ─────────────────────────────────────────────────────────────────

  describe('revoke()', () => {
    it('calls revokeDelegation on facade and emits audit event', async () => {
      delegationFacade.revokeDelegation.mockResolvedValue(undefined)
      auditFacade.recordEvent.mockResolvedValue(undefined)

      await service.revoke({
        tenantId: TENANT_ID,
        delegationId: DELEGATION_ID,
        reason: 'user_request',
      })

      expect(delegationFacade.revokeDelegation).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        delegationId: DELEGATION_ID,
        reason: 'user_request',
      })
      expect(auditFacade.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'agent.delegation_revoked',
          payload: expect.objectContaining({ delegationId: DELEGATION_ID, reason: 'user_request' }),
        }),
      )
    })
  })

  // ─── listActive() ─────────────────────────────────────────────────────────────

  describe('listActive()', () => {
    it('calls listActiveByDelegator when userId provided', async () => {
      const delegations = [makeFakeDelegation()]
      delegationFacade.listActiveByDelegator.mockResolvedValue(delegations)

      const result = await service.listActive({ tenantId: TENANT_ID, userId: USER_ID })

      expect(delegationFacade.listActiveByDelegator).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        delegatorUserId: USER_ID,
      })
      expect(delegationFacade.listActiveForTenant).not.toHaveBeenCalled()
      expect(result).toEqual(delegations)
    })

    it('calls listActiveForTenant when no userId provided', async () => {
      const delegations = [makeFakeDelegation(), makeFakeDelegation({ id: 'other-deleg' })]
      delegationFacade.listActiveForTenant.mockResolvedValue(delegations)

      const result = await service.listActive({ tenantId: TENANT_ID })

      expect(delegationFacade.listActiveForTenant).toHaveBeenCalledWith({ tenantId: TENANT_ID })
      expect(delegationFacade.listActiveByDelegator).not.toHaveBeenCalled()
      expect(result).toEqual(delegations)
    })
  })

  // ─── sweepExpired() ───────────────────────────────────────────────────────────

  describe('sweepExpired()', () => {
    it('returns the correct expiredCount', async () => {
      delegationFacade.sweepExpired.mockResolvedValue({
        expiredDelegationIds: ['d-1', 'd-2', 'd-3'],
        affectedTenantIds: [TENANT_ID],
      })
      scheduleRepo.listForTenant.mockResolvedValue([])
      auditFacade.recordEvent.mockResolvedValue(undefined)

      const result = await service.sweepExpired()

      expect(result).toEqual({ expiredCount: 3 })
    })

    it('calls sweepExpired on delegation facade with a Date', async () => {
      delegationFacade.sweepExpired.mockResolvedValue({
        expiredDelegationIds: [],
        affectedTenantIds: [],
      })

      await service.sweepExpired()

      expect(delegationFacade.sweepExpired).toHaveBeenCalledWith({
        beforeDate: expect.any(Date),
      })
    })

    it('pauses schedules linked to expired delegations', async () => {
      const SCHEDULE_ID = '01900000-0000-7fff-8000-000000000010'
      delegationFacade.sweepExpired.mockResolvedValue({
        expiredDelegationIds: ['d-expired'],
        affectedTenantIds: [TENANT_ID],
      })
      scheduleRepo.listForTenant.mockResolvedValue([
        {
          id: SCHEDULE_ID,
          tenantId: TENANT_ID,
          delegationId: 'd-expired',
          status: 'active',
          kind: 'personal',
          ownerUserId: USER_ID,
          createdBy: USER_ID,
          triggerKind: 'cron',
          prompt: 'test',
          costCeilingDailyUsd: '1',
          invocationCeilingDaily: 10,
          createdAt: new Date(),
          updatedAt: new Date(),
          consecutiveFailureCount: 0,
          pauseReason: null,
          failureAlertPolicy: 'owner' as const,
          cronExpression: '0 * * * *',
          eventSubscription: null,
        },
      ])
      scheduleRepo.update.mockResolvedValue(undefined)
      auditFacade.recordEvent.mockResolvedValue(undefined)

      await service.sweepExpired()

      expect(scheduleRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          scheduleId: SCHEDULE_ID,
          status: 'paused',
          pauseReason: 'delegation_expired',
        }),
      )
    })

    it('returns expiredCount 0 when nothing expired', async () => {
      delegationFacade.sweepExpired.mockResolvedValue({
        expiredDelegationIds: [],
        affectedTenantIds: [],
      })

      const result = await service.sweepExpired()

      expect(result).toEqual({ expiredCount: 0 })
    })
  })

  // ─── handleUserOffboarding() ──────────────────────────────────────────────────

  describe('handleUserOffboarding()', () => {
    const offboardingOpts = {
      tenantId: TENANT_ID,
      userId: USER_ID,
      offboardingActorId: ACTOR_ID,
    }

    it('revokes all delegations, pauses all personal schedules, and returns correct counts', async () => {
      delegationFacade.bulkRevokeByDelegator.mockResolvedValue({
        revokedIds: ['d-1', 'd-2'],
      })
      scheduleRepo.bulkPauseByOwner.mockResolvedValue({ count: 3 })
      auditFacade.recordEvent.mockResolvedValue(undefined)
      notificationsFacade.sendDraftApprovalNotification.mockResolvedValue(undefined)

      const result = await service.handleUserOffboarding(offboardingOpts)

      expect(result).toEqual({
        revokedDelegationCount: 2,
        pausedScheduleCount: 3,
        reassignedScheduleCount: 0,
      })
    })

    it('calls bulkRevokeByDelegator with reason owner_offboarded', async () => {
      delegationFacade.bulkRevokeByDelegator.mockResolvedValue({ revokedIds: [] })
      scheduleRepo.bulkPauseByOwner.mockResolvedValue({ count: 0 })
      auditFacade.recordEvent.mockResolvedValue(undefined)
      notificationsFacade.sendDraftApprovalNotification.mockResolvedValue(undefined)

      await service.handleUserOffboarding(offboardingOpts)

      expect(delegationFacade.bulkRevokeByDelegator).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        delegatorUserId: USER_ID,
        reason: 'owner_offboarded',
      })
    })

    it('calls bulkPauseByOwner with pause reason owner_offboarded', async () => {
      delegationFacade.bulkRevokeByDelegator.mockResolvedValue({ revokedIds: [] })
      scheduleRepo.bulkPauseByOwner.mockResolvedValue({ count: 0 })
      auditFacade.recordEvent.mockResolvedValue(undefined)
      notificationsFacade.sendDraftApprovalNotification.mockResolvedValue(undefined)

      await service.handleUserOffboarding(offboardingOpts)

      expect(scheduleRepo.bulkPauseByOwner).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        ownerUserId: USER_ID,
        pauseReason: 'owner_offboarded',
      })
    })

    it('emits audit agent.schedules_revoked_on_offboarding', async () => {
      delegationFacade.bulkRevokeByDelegator.mockResolvedValue({ revokedIds: ['d-1'] })
      scheduleRepo.bulkPauseByOwner.mockResolvedValue({ count: 2 })
      auditFacade.recordEvent.mockResolvedValue(undefined)
      notificationsFacade.sendDraftApprovalNotification.mockResolvedValue(undefined)

      await service.handleUserOffboarding(offboardingOpts)

      expect(auditFacade.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'agent.schedules_revoked_on_offboarding',
          payload: expect.objectContaining({
            tenantId: TENANT_ID,
            userId: USER_ID,
            offboardingActorId: ACTOR_ID,
            revokedDelegationIds: ['d-1'],
            pausedScheduleCount: 2,
          }),
        }),
      )
    })

    it('always returns reassignedScheduleCount = 0', async () => {
      delegationFacade.bulkRevokeByDelegator.mockResolvedValue({
        revokedIds: ['d-1', 'd-2', 'd-3'],
      })
      scheduleRepo.bulkPauseByOwner.mockResolvedValue({ count: 5 })
      auditFacade.recordEvent.mockResolvedValue(undefined)
      notificationsFacade.sendDraftApprovalNotification.mockResolvedValue(undefined)

      const result = await service.handleUserOffboarding(offboardingOpts)

      expect(result.reassignedScheduleCount).toBe(0)
    })
  })
})
