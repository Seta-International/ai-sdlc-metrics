import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ScheduledTurnWorker, type ScheduledTurnJob } from './scheduled-turn-worker'
import { type IScheduleRepository } from '../../domain/repositories/schedule.repository'
import { type IScheduleRunRepository } from '../../domain/repositories/schedule-run.repository'
import type { KernelDelegationFacade } from '../../../kernel/application/facades/kernel-delegation.facade'
import type { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import type { NotificationsWriteFacade } from '../../../notifications/application/facades/notifications-write.facade'
import type { Schedule } from '../../domain/entities/schedule.entity'
import type { ScheduleRun } from '../../domain/entities/schedule-run.entity'

type AgentDelegation = NonNullable<Awaited<ReturnType<KernelDelegationFacade['getDelegation']>>>

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TENANT_ID = '00000000-0000-7000-8000-000000000001'
const SCHEDULE_ID = '00000000-0000-7000-8000-000000000002'
const DELEGATION_ID = '00000000-0000-7000-8000-000000000003'
const OWNER_USER_ID = '00000000-0000-7000-8000-000000000004'
const FLOW_ID = '00000000-0000-7000-8000-000000000005'
const RUN_ID = '00000000-0000-7000-8000-000000000010'

function makeJob(overrides: Partial<ScheduledTurnJob> = {}): ScheduledTurnJob {
  return {
    tenant_id: TENANT_ID,
    user_on_behalf_of: OWNER_USER_ID,
    actor_principal: 'user',
    schedule_id: SCHEDULE_ID,
    delegation_id: DELEGATION_ID,
    flow_id: FLOW_ID,
    taint_seeded: false,
    cost_ceiling_remaining_usd: 10,
    invocation_ceiling_remaining: 5,
    pinned_versions: {
      router_version: 'v1',
      sub_agent_version: 'v1',
      tool_meta_version: 'v1',
      model_id: 'gpt-5.4',
    },
    fired_by: 'cron',
    ...overrides,
  }
}

function makeSchedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: SCHEDULE_ID,
    tenantId: TENANT_ID,
    kind: 'personal',
    ownerUserId: OWNER_USER_ID,
    createdBy: OWNER_USER_ID,
    triggerKind: 'cron',
    cronExpression: '0 9 * * 1-5',
    eventSubscription: null,
    prompt: 'Summarize my tasks',
    delegationId: DELEGATION_ID,
    costCeilingDailyUsd: '5.00',
    invocationCeilingDaily: 10,
    status: 'active',
    pauseReason: null,
    consecutiveFailureCount: 0,
    failureAlertPolicy: 'owner',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeDelegation(overrides: Partial<AgentDelegation> = {}): AgentDelegation {
  return {
    id: DELEGATION_ID,
    tenantId: TENANT_ID,
    delegatorUserId: OWNER_USER_ID,
    delegate: 'agent:scheduler',
    scope: { permitted_tools: ['planner.list_tasks'] },
    expiresAt: new Date(Date.now() + 86400_000),
    status: 'active',
    createdAt: new Date(),
    ...overrides,
  }
}

function makeScheduleRun(overrides: Partial<ScheduleRun> = {}): ScheduleRun {
  return {
    id: RUN_ID,
    scheduleId: SCHEDULE_ID,
    tenantId: TENANT_ID,
    traceId: '00000000-0000-7000-8000-000000000020',
    flowId: FLOW_ID,
    pgBossJobId: null,
    startedAt: new Date(),
    endedAt: null,
    outcome: null,
    taintSeeded: false,
    pinnedVersions: {
      router_version: 'v1',
      sub_agent_version: 'v1',
      tool_meta_version: 'v1',
      model_id: 'gpt-5.4',
    },
    costSpentUsd: '0',
    firedBy: 'cron',
    ...overrides,
  }
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

function makeScheduleRepo(overrides: Partial<IScheduleRepository> = {}): IScheduleRepository {
  return {
    insert: vi.fn(),
    getById: vi.fn().mockResolvedValue(makeSchedule()),
    update: vi.fn().mockResolvedValue(undefined),
    listForUser: vi.fn().mockResolvedValue([]),
    listForTenant: vi.fn().mockResolvedValue([]),
    countActiveForTenant: vi.fn().mockResolvedValue(0),
    bulkPauseForTenant: vi.fn().mockResolvedValue({ count: 0 }),
    listPersonalByOwner: vi.fn().mockResolvedValue([]),
    bulkPauseByOwner: vi.fn().mockResolvedValue({ count: 0 }),
    ...overrides,
  }
}

function makeScheduleRunRepo(
  overrides: Partial<IScheduleRunRepository> = {},
): IScheduleRunRepository {
  return {
    insert: vi.fn().mockResolvedValue(makeScheduleRun()),
    updateOutcome: vi.fn().mockResolvedValue(undefined),
    getById: vi.fn().mockResolvedValue(null),
    getByTraceId: vi.fn().mockResolvedValue(null),
    listBySchedule: vi.fn().mockResolvedValue([]),
    countTodayBySchedule: vi.fn().mockResolvedValue(0),
    sumTodayCostBySchedule: vi.fn().mockResolvedValue(0),
    ...overrides,
  }
}

function makeKernelDelegationFacade(
  overrides: Partial<KernelDelegationFacade> = {},
): KernelDelegationFacade {
  return {
    createDelegation: vi.fn(),
    revokeDelegation: vi.fn(),
    getDelegation: vi.fn().mockResolvedValue(makeDelegation()),
    countActiveByDelegator: vi.fn(),
    listActiveByDelegator: vi.fn(),
    listActiveForTenant: vi.fn(),
    sweepExpired: vi.fn(),
    bulkRevokeByDelegator: vi.fn(),
    ...overrides,
  } as unknown as KernelDelegationFacade
}

function makeKernelAuditFacade(overrides: Partial<KernelAuditFacade> = {}): KernelAuditFacade {
  return {
    recordEvent: vi.fn().mockResolvedValue(undefined),
    publishOutboxEvent: vi.fn().mockResolvedValue(undefined),
    queryAuditLog: vi.fn(),
    exportAuditLog: vi.fn(),
    ...overrides,
  } as unknown as KernelAuditFacade
}

function makeNotificationsFacade(
  overrides: Partial<NotificationsWriteFacade> = {},
): NotificationsWriteFacade {
  return {
    sendDraftApprovalNotification: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as NotificationsWriteFacade
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ScheduledTurnWorker', () => {
  let scheduleRepo: IScheduleRepository
  let scheduleRunRepo: IScheduleRunRepository
  let delegationFacade: KernelDelegationFacade
  let auditFacade: KernelAuditFacade
  let notificationsFacade: NotificationsWriteFacade
  let worker: ScheduledTurnWorker

  beforeEach(() => {
    vi.clearAllMocks()
    scheduleRepo = makeScheduleRepo()
    scheduleRunRepo = makeScheduleRunRepo()
    delegationFacade = makeKernelDelegationFacade()
    auditFacade = makeKernelAuditFacade()
    notificationsFacade = makeNotificationsFacade()
    worker = new ScheduledTurnWorker(
      scheduleRepo,
      scheduleRunRepo,
      delegationFacade,
      auditFacade,
      notificationsFacade,
    )
  })

  describe('handle()', () => {
    it('happy path: active schedule + active delegation → run inserted, outcome=completed, failure count reset', async () => {
      await worker.handle(makeJob())

      expect(scheduleRunRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduleId: SCHEDULE_ID,
          tenantId: TENANT_ID,
          flowId: FLOW_ID,
          taintSeeded: false,
          firedBy: 'cron',
        }),
      )
      expect(scheduleRunRepo.updateOutcome).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          runId: RUN_ID,
          outcome: 'completed',
        }),
      )
      expect(scheduleRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          scheduleId: SCHEDULE_ID,
          consecutiveFailureCount: 0,
        }),
      )
    })

    it('happy path: emits schedule_run_started and async_dry_run_would_have_written audits', async () => {
      await worker.handle(makeJob())

      const recordEventMock = auditFacade.recordEvent as ReturnType<typeof vi.fn>
      const auditCalls = recordEventMock.mock.calls.map(
        (c: [{ eventType: string }]) => c[0].eventType,
      )
      expect(auditCalls).toContain('agent.schedule_run_started')
      expect(auditCalls).toContain('agent.async_dry_run_would_have_written')
      expect(auditCalls).toContain('agent.schedule_run_completed')
    })

    it('happy path: sends notification to owner', async () => {
      await worker.handle(makeJob())

      expect(notificationsFacade.sendDraftApprovalNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
        }),
      )
    })

    it('inactive schedule (paused) → early return, no run inserted', async () => {
      scheduleRepo = makeScheduleRepo({
        getById: vi.fn().mockResolvedValue(makeSchedule({ status: 'paused' })),
      })
      worker = new ScheduledTurnWorker(
        scheduleRepo,
        scheduleRunRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
      )

      await worker.handle(makeJob())

      expect(scheduleRunRepo.insert).not.toHaveBeenCalled()
      expect(auditFacade.recordEvent).not.toHaveBeenCalled()
    })

    it('schedule not found → early return, no run inserted', async () => {
      scheduleRepo = makeScheduleRepo({
        getById: vi.fn().mockResolvedValue(null),
      })
      worker = new ScheduledTurnWorker(
        scheduleRepo,
        scheduleRunRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
      )

      await worker.handle(makeJob())

      expect(scheduleRunRepo.insert).not.toHaveBeenCalled()
    })

    it('delegation expired → early return, no run inserted', async () => {
      delegationFacade = makeKernelDelegationFacade({
        getDelegation: vi.fn().mockResolvedValue(makeDelegation({ status: 'expired' })),
      })
      worker = new ScheduledTurnWorker(
        scheduleRepo,
        scheduleRunRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
      )

      await worker.handle(makeJob())

      expect(scheduleRunRepo.insert).not.toHaveBeenCalled()
      expect(auditFacade.recordEvent).not.toHaveBeenCalled()
    })

    it('delegation not found → early return, no run inserted', async () => {
      delegationFacade = makeKernelDelegationFacade({
        getDelegation: vi.fn().mockResolvedValue(null),
      })
      worker = new ScheduledTurnWorker(
        scheduleRepo,
        scheduleRunRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
      )

      await worker.handle(makeJob())

      expect(scheduleRunRepo.insert).not.toHaveBeenCalled()
    })

    it('unexpected error → schedule_run outcome=error, consecutive_failure_count incremented', async () => {
      const error = new Error('unexpected DB failure')
      scheduleRunRepo = makeScheduleRunRepo({
        insert: vi.fn().mockResolvedValue(makeScheduleRun()),
        updateOutcome: vi.fn().mockRejectedValue(error),
      })
      worker = new ScheduledTurnWorker(
        scheduleRepo,
        scheduleRunRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
      )

      await expect(worker.handle(makeJob())).rejects.toThrow('unexpected DB failure')

      expect(scheduleRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          scheduleId: SCHEDULE_ID,
          consecutiveFailureCount: 1,
        }),
      )
    })

    it('3 consecutive failures → schedule paused with reason=consecutive_failures', async () => {
      scheduleRepo = makeScheduleRepo({
        getById: vi.fn().mockResolvedValue(makeSchedule({ consecutiveFailureCount: 2 })),
      })
      const error = new Error('third failure')
      scheduleRunRepo = makeScheduleRunRepo({
        insert: vi.fn().mockResolvedValue(makeScheduleRun()),
        updateOutcome: vi.fn().mockRejectedValue(error),
      })
      worker = new ScheduledTurnWorker(
        scheduleRepo,
        scheduleRunRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
      )

      await expect(worker.handle(makeJob())).rejects.toThrow('third failure')

      expect(scheduleRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          scheduleId: SCHEDULE_ID,
          consecutiveFailureCount: 3,
          status: 'paused',
          pauseReason: 'consecutive_failures',
        }),
      )
    })

    it('3 consecutive failures → notifies owner about auto-pause', async () => {
      scheduleRepo = makeScheduleRepo({
        getById: vi.fn().mockResolvedValue(makeSchedule({ consecutiveFailureCount: 2 })),
      })
      const error = new Error('third failure')
      scheduleRunRepo = makeScheduleRunRepo({
        insert: vi.fn().mockResolvedValue(makeScheduleRun()),
        updateOutcome: vi.fn().mockRejectedValue(error),
      })
      worker = new ScheduledTurnWorker(
        scheduleRepo,
        scheduleRunRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
      )

      await expect(worker.handle(makeJob())).rejects.toThrow('third failure')

      expect(notificationsFacade.sendDraftApprovalNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
        }),
      )
    })

    it('pinned_versions are passed through to schedule_run insert', async () => {
      const pinnedVersions = {
        router_version: 'v2',
        sub_agent_version: 'v3',
        tool_meta_version: 'v4',
        model_id: 'gpt-5.4-nano',
      }

      await worker.handle(makeJob({ pinned_versions: pinnedVersions }))

      expect(scheduleRunRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          pinnedVersions,
        }),
      )
    })

    it('dry-run audit includes feature_flag and flag_enabled fields', async () => {
      await worker.handle(makeJob())

      const recordEventMock = auditFacade.recordEvent as ReturnType<typeof vi.fn>
      const dryRunCall = recordEventMock.mock.calls.find(
        (c: [{ eventType: string }]) => c[0].eventType === 'agent.async_dry_run_would_have_written',
      )
      expect(dryRunCall).toBeDefined()
      expect(dryRunCall![0].payload).toMatchObject({
        feature_flag: 'feature.agent.async_autonomous_writes',
        flag_enabled: false,
      })
    })

    it('failure count=1 notifies owner when policy=owner', async () => {
      const error = new Error('first failure')
      scheduleRepo = makeScheduleRepo({
        getById: vi
          .fn()
          .mockResolvedValue(
            makeSchedule({ consecutiveFailureCount: 0, failureAlertPolicy: 'owner' }),
          ),
      })
      scheduleRunRepo = makeScheduleRunRepo({
        insert: vi.fn().mockResolvedValue(makeScheduleRun()),
        updateOutcome: vi.fn().mockRejectedValue(error),
      })
      worker = new ScheduledTurnWorker(
        scheduleRepo,
        scheduleRunRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
      )

      await expect(worker.handle(makeJob())).rejects.toThrow('first failure')

      expect(notificationsFacade.sendDraftApprovalNotification).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT_ID }),
      )
    })

    it('failure count=2 notifies owner when policy=owner_and_admin', async () => {
      const error = new Error('second failure')
      scheduleRepo = makeScheduleRepo({
        getById: vi
          .fn()
          .mockResolvedValue(
            makeSchedule({ consecutiveFailureCount: 1, failureAlertPolicy: 'owner_and_admin' }),
          ),
      })
      scheduleRunRepo = makeScheduleRunRepo({
        insert: vi.fn().mockResolvedValue(makeScheduleRun()),
        updateOutcome: vi.fn().mockRejectedValue(error),
      })
      worker = new ScheduledTurnWorker(
        scheduleRepo,
        scheduleRunRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
      )

      await expect(worker.handle(makeJob())).rejects.toThrow('second failure')

      expect(notificationsFacade.sendDraftApprovalNotification).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT_ID }),
      )
    })

    it('failure count=1 does NOT notify when policy=silent', async () => {
      const error = new Error('silent failure')
      scheduleRepo = makeScheduleRepo({
        getById: vi
          .fn()
          .mockResolvedValue(
            makeSchedule({ consecutiveFailureCount: 0, failureAlertPolicy: 'silent' }),
          ),
      })
      scheduleRunRepo = makeScheduleRunRepo({
        insert: vi.fn().mockResolvedValue(makeScheduleRun()),
        updateOutcome: vi.fn().mockRejectedValue(error),
      })
      worker = new ScheduledTurnWorker(
        scheduleRepo,
        scheduleRunRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
      )

      await expect(worker.handle(makeJob())).rejects.toThrow('silent failure')

      expect(notificationsFacade.sendDraftApprovalNotification).not.toHaveBeenCalled()
    })

    it('failure count=1 does NOT notify owner when policy=admin_only', async () => {
      const error = new Error('admin-only failure')
      scheduleRepo = makeScheduleRepo({
        getById: vi
          .fn()
          .mockResolvedValue(
            makeSchedule({ consecutiveFailureCount: 0, failureAlertPolicy: 'admin_only' }),
          ),
      })
      scheduleRunRepo = makeScheduleRunRepo({
        insert: vi.fn().mockResolvedValue(makeScheduleRun()),
        updateOutcome: vi.fn().mockRejectedValue(error),
      })
      worker = new ScheduledTurnWorker(
        scheduleRepo,
        scheduleRunRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
      )

      await expect(worker.handle(makeJob())).rejects.toThrow('admin-only failure')

      expect(notificationsFacade.sendDraftApprovalNotification).not.toHaveBeenCalled()
    })
  })
})
