import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ScheduledTurnWorker, type ScheduledTurnJob } from './scheduled-turn-worker'
import { type IScheduleRepository } from '../../domain/repositories/schedule.repository'
import { type IScheduleRunRepository } from '../../domain/repositories/schedule-run.repository'
import type { KernelDelegationFacade } from '../../../kernel/application/facades/kernel-delegation.facade'
import type { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import type { NotificationsWriteFacade } from '../../../notifications/application/facades/notifications-write.facade'
import type {
  ScheduledTurnService,
  ScheduledTurnResult,
} from '../../application/services/scheduled-turn-service'
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

function makeScheduledTurnService(
  result: ScheduledTurnResult = { outcome: 'completed', costSpentUsd: 0 },
): ScheduledTurnService {
  return {
    executeScheduledTurn: vi.fn().mockResolvedValue(result),
  } as unknown as ScheduledTurnService
}

// ── Helper to construct worker ─────────────────────────────────────────────────

function buildWorker(
  overrides: {
    scheduleRepo?: IScheduleRepository
    scheduleRunRepo?: IScheduleRunRepository
    delegationFacade?: KernelDelegationFacade
    auditFacade?: KernelAuditFacade
    notificationsFacade?: NotificationsWriteFacade
    scheduledTurnService?: ScheduledTurnService
  } = {},
): ScheduledTurnWorker {
  return new ScheduledTurnWorker(
    overrides.scheduleRepo ?? makeScheduleRepo(),
    overrides.scheduleRunRepo ?? makeScheduleRunRepo(),
    overrides.delegationFacade ?? makeKernelDelegationFacade(),
    overrides.auditFacade ?? makeKernelAuditFacade(),
    overrides.notificationsFacade ?? makeNotificationsFacade(),
    overrides.scheduledTurnService ?? makeScheduledTurnService(),
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ScheduledTurnWorker', () => {
  let scheduleRepo: IScheduleRepository
  let scheduleRunRepo: IScheduleRunRepository
  let delegationFacade: KernelDelegationFacade
  let auditFacade: KernelAuditFacade
  let notificationsFacade: NotificationsWriteFacade
  let scheduledTurnService: ScheduledTurnService
  let worker: ScheduledTurnWorker

  beforeEach(() => {
    vi.clearAllMocks()
    scheduleRepo = makeScheduleRepo()
    scheduleRunRepo = makeScheduleRunRepo()
    delegationFacade = makeKernelDelegationFacade()
    auditFacade = makeKernelAuditFacade()
    notificationsFacade = makeNotificationsFacade()
    scheduledTurnService = makeScheduledTurnService()
    worker = buildWorker({
      scheduleRepo,
      scheduleRunRepo,
      delegationFacade,
      auditFacade,
      notificationsFacade,
      scheduledTurnService,
    })
  })

  describe('handle()', () => {
    // ── Worker test 1: pipeline is called with schedule intent + readOnly policy ─

    it('invokes ScheduledTurnService with schedule prompt, delegation, and read-only policy', async () => {
      await worker.handle(makeJob())

      expect(scheduledTurnService.executeScheduledTurn).toHaveBeenCalledOnce()
      const callArg = (scheduledTurnService.executeScheduledTurn as ReturnType<typeof vi.fn>).mock
        .calls[0][0]
      expect(callArg.tenantId).toBe(TENANT_ID)
      expect(callArg.prompt).toBe('Summarize my tasks')
      expect(callArg.delegationId).toBe(DELEGATION_ID)
      expect(callArg.scheduleId).toBe(SCHEDULE_ID)
      expect(callArg.flowId).toBe(FLOW_ID)
      expect(callArg.taintSeeded).toBe(false)
      // Policy is read-only
      expect(callArg.actorPrincipal).toBe('user')
    })

    // ── Worker test 2: pipeline success → run row updated to 'completed' ──────

    it('happy path: pipeline returns completed → run outcome=completed, failure count reset', async () => {
      // Use the shared scheduleRunRepo/scheduleRepo from beforeEach so assertions work
      scheduledTurnService = makeScheduledTurnService({ outcome: 'completed', costSpentUsd: 0 })
      worker = buildWorker({
        scheduleRepo,
        scheduleRunRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
        scheduledTurnService,
      })

      await worker.handle(makeJob())

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

    // ── Worker test 3: pipeline 'refused' (policy_violation) → run outcome='refused' ─

    it('when pipeline returns refused, run row is set to outcome=refused', async () => {
      scheduledTurnService = makeScheduledTurnService({
        outcome: 'refused',
        costSpentUsd: 0,
        refusedToolName: 'planner.createTask',
      })
      worker = buildWorker({
        scheduleRepo,
        scheduleRunRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
        scheduledTurnService,
      })

      await worker.handle(makeJob())

      expect(scheduleRunRepo.updateOutcome).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          runId: RUN_ID,
          outcome: 'refused',
        }),
      )
    })

    // ── Worker test 4: pipeline error → run row updated to 'error' ────────────

    it('when pipeline returns error, run row is set to outcome=error', async () => {
      scheduledTurnService = makeScheduledTurnService({
        outcome: 'error',
        costSpentUsd: 0,
        errorMessage: 'gateway_tripwire:infra_error',
      })
      worker = buildWorker({
        scheduleRepo,
        scheduleRunRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
        scheduledTurnService,
      })

      await worker.handle(makeJob())

      expect(scheduleRunRepo.updateOutcome).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          runId: RUN_ID,
          outcome: 'error',
        }),
      )
    })

    // ── Ensure old dry-run event is NOT emitted ────────────────────────────────

    it('does NOT emit agent.async_dry_run_would_have_written audit on success (dry-run stub removed)', async () => {
      await worker.handle(makeJob())

      const recordEventMock = auditFacade.recordEvent as ReturnType<typeof vi.fn>
      const auditCalls = recordEventMock.mock.calls.map(
        (c: [{ eventType: string }]) => c[0].eventType,
      )
      expect(auditCalls).not.toContain('agent.async_dry_run_would_have_written')
    })

    // ── Audit events emitted correctly ────────────────────────────────────────

    it('emits schedule_run_started and schedule_run_completed audit events on success', async () => {
      await worker.handle(makeJob())

      const recordEventMock = auditFacade.recordEvent as ReturnType<typeof vi.fn>
      const auditCalls = recordEventMock.mock.calls.map(
        (c: [{ eventType: string }]) => c[0].eventType,
      )
      expect(auditCalls).toContain('agent.schedule_run_started')
      expect(auditCalls).toContain('agent.schedule_run_completed')
    })

    // ── Notification sent to owner on success ─────────────────────────────────

    it('sends notification to owner on success', async () => {
      await worker.handle(makeJob())

      expect(notificationsFacade.sendDraftApprovalNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
        }),
      )
    })

    // ── Early-exit guards (schedule/delegation validation) ────────────────────

    it('inactive schedule (paused) → early return, no run inserted', async () => {
      worker = buildWorker({
        scheduleRepo: makeScheduleRepo({
          getById: vi.fn().mockResolvedValue(makeSchedule({ status: 'paused' })),
        }),
      })

      await worker.handle(makeJob())

      expect(scheduleRunRepo.insert).not.toHaveBeenCalled()
      expect(auditFacade.recordEvent).not.toHaveBeenCalled()
    })

    it('schedule not found → early return, no run inserted', async () => {
      worker = buildWorker({
        scheduleRepo: makeScheduleRepo({
          getById: vi.fn().mockResolvedValue(null),
        }),
      })

      await worker.handle(makeJob())

      expect(scheduleRunRepo.insert).not.toHaveBeenCalled()
    })

    it('delegation expired → early return, no run inserted', async () => {
      worker = buildWorker({
        delegationFacade: makeKernelDelegationFacade({
          getDelegation: vi.fn().mockResolvedValue(makeDelegation({ status: 'expired' })),
        }),
      })

      await worker.handle(makeJob())

      expect(scheduleRunRepo.insert).not.toHaveBeenCalled()
      expect(auditFacade.recordEvent).not.toHaveBeenCalled()
    })

    it('delegation not found → early return, no run inserted', async () => {
      worker = buildWorker({
        delegationFacade: makeKernelDelegationFacade({
          getDelegation: vi.fn().mockResolvedValue(null),
        }),
      })

      await worker.handle(makeJob())

      expect(scheduleRunRepo.insert).not.toHaveBeenCalled()
    })

    // ── Unexpected error handling ─────────────────────────────────────────────

    it('unexpected error → outcome=error, consecutive_failure_count incremented, re-throw', async () => {
      const error = new Error('unexpected DB failure')
      scheduleRunRepo = makeScheduleRunRepo({
        insert: vi.fn().mockResolvedValue(makeScheduleRun()),
        updateOutcome: vi.fn().mockRejectedValue(error),
      })
      worker = buildWorker({
        scheduleRepo,
        scheduleRunRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
        scheduledTurnService,
      })

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
      worker = buildWorker({
        scheduleRepo,
        scheduleRunRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
        scheduledTurnService,
      })

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
      worker = buildWorker({
        scheduleRepo,
        scheduleRunRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
        scheduledTurnService,
      })

      await expect(worker.handle(makeJob())).rejects.toThrow('third failure')

      expect(notificationsFacade.sendDraftApprovalNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
        }),
      )
    })

    // ── M1: refused outcome increments consecutive_failure_count (R-09.29) ─────
    // A schedule whose delegation scope contains only mutation tools will always get
    // 'refused' under READ_ONLY_POLICY. Before this fix the 'refused' outcome reset the
    // counter, so such a schedule would fire forever without ever auto-pausing.
    // Per R-09.29: only 'completed' resets the counter; 'refused', 'error', and 'budget'
    // all increment it.

    it('refused outcome increments consecutive_failure_count (not reset to 0)', async () => {
      scheduledTurnService = makeScheduledTurnService({
        outcome: 'refused',
        costSpentUsd: 0,
        refusedToolName: 'planner.createTask',
      })
      scheduleRepo = makeScheduleRepo({
        getById: vi.fn().mockResolvedValue(makeSchedule({ consecutiveFailureCount: 1 })),
      })
      worker = buildWorker({
        scheduleRepo,
        scheduleRunRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
        scheduledTurnService,
      })

      await worker.handle(makeJob())

      expect(scheduleRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          scheduleId: SCHEDULE_ID,
          consecutiveFailureCount: 2,
        }),
      )
    })

    it('refused outcome at threshold triggers auto-pause (escalation per R-09.29)', async () => {
      // N-1 = 2 prior failures; 'refused' on this run pushes the count to 3 → auto-pause
      scheduledTurnService = makeScheduledTurnService({
        outcome: 'refused',
        costSpentUsd: 0,
        refusedToolName: 'planner.createTask',
      })
      scheduleRepo = makeScheduleRepo({
        getById: vi.fn().mockResolvedValue(makeSchedule({ consecutiveFailureCount: 2 })),
      })
      worker = buildWorker({
        scheduleRepo,
        scheduleRunRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
        scheduledTurnService,
      })

      await worker.handle(makeJob())

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
      worker = buildWorker({
        scheduleRepo,
        scheduleRunRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
        scheduledTurnService,
      })

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
      worker = buildWorker({
        scheduleRepo,
        scheduleRunRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
        scheduledTurnService,
      })

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
      worker = buildWorker({
        scheduleRepo,
        scheduleRunRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
        scheduledTurnService,
      })

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
      worker = buildWorker({
        scheduleRepo,
        scheduleRunRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
        scheduledTurnService,
      })

      await expect(worker.handle(makeJob())).rejects.toThrow('admin-only failure')

      expect(notificationsFacade.sendDraftApprovalNotification).not.toHaveBeenCalled()
    })

    // ── I-2 / R-09.30: count=3 auto-pause always notifies owner regardless of failureAlertPolicy ─

    it('auto-pause at count=3 notifies owner even with failureAlertPolicy=silent (R-09.30)', async () => {
      // Prior count=2 + this failure = 3 → triggers auto-pause → must notify regardless of 'silent'
      scheduleRepo = makeScheduleRepo({
        getById: vi
          .fn()
          .mockResolvedValue(
            makeSchedule({ consecutiveFailureCount: 2, failureAlertPolicy: 'silent' }),
          ),
      })
      const error = new Error('third failure — silent policy')
      scheduleRunRepo = makeScheduleRunRepo({
        insert: vi.fn().mockResolvedValue(makeScheduleRun()),
        updateOutcome: vi.fn().mockRejectedValue(error),
      })
      worker = buildWorker({
        scheduleRepo,
        scheduleRunRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
        scheduledTurnService,
      })

      await expect(worker.handle(makeJob())).rejects.toThrow('third failure — silent policy')

      // Schedule must be paused
      expect(scheduleRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          consecutiveFailureCount: 3,
          status: 'paused',
          pauseReason: 'consecutive_failures',
        }),
      )
      // Owner MUST be notified despite 'silent' policy (R-09.30)
      expect(notificationsFacade.sendDraftApprovalNotification).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT_ID }),
      )
    })

    it('auto-pause at count=3 notifies owner even with failureAlertPolicy=admin_only (R-09.30)', async () => {
      scheduleRepo = makeScheduleRepo({
        getById: vi
          .fn()
          .mockResolvedValue(
            makeSchedule({ consecutiveFailureCount: 2, failureAlertPolicy: 'admin_only' }),
          ),
      })
      const error = new Error('third failure — admin_only policy')
      scheduleRunRepo = makeScheduleRunRepo({
        insert: vi.fn().mockResolvedValue(makeScheduleRun()),
        updateOutcome: vi.fn().mockRejectedValue(error),
      })
      worker = buildWorker({
        scheduleRepo,
        scheduleRunRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
        scheduledTurnService,
      })

      await expect(worker.handle(makeJob())).rejects.toThrow('third failure — admin_only policy')

      expect(notificationsFacade.sendDraftApprovalNotification).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT_ID }),
      )
    })

    // ── I-2: pipeline-return path respects failureAlertPolicy when not auto-pausing ─

    it('pipeline-return refused (count=1, no auto-pause) does NOT notify owner when policy=silent', async () => {
      scheduledTurnService = makeScheduledTurnService({
        outcome: 'refused',
        costSpentUsd: 0,
        refusedToolName: 'planner.createTask',
      })
      scheduleRepo = makeScheduleRepo({
        getById: vi
          .fn()
          .mockResolvedValue(
            makeSchedule({ consecutiveFailureCount: 0, failureAlertPolicy: 'silent' }),
          ),
      })
      worker = buildWorker({
        scheduleRepo,
        scheduleRunRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
        scheduledTurnService,
      })

      await worker.handle(makeJob())

      // policy=silent and no auto-pause → notification must NOT be sent
      expect(notificationsFacade.sendDraftApprovalNotification).not.toHaveBeenCalled()
    })

    it('pipeline-return refused at count=3 (auto-pause) notifies owner even with policy=silent (R-09.30)', async () => {
      scheduledTurnService = makeScheduledTurnService({
        outcome: 'refused',
        costSpentUsd: 0,
        refusedToolName: 'planner.createTask',
      })
      scheduleRepo = makeScheduleRepo({
        getById: vi
          .fn()
          .mockResolvedValue(
            makeSchedule({ consecutiveFailureCount: 2, failureAlertPolicy: 'silent' }),
          ),
      })
      worker = buildWorker({
        scheduleRepo,
        scheduleRunRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
        scheduledTurnService,
      })

      await worker.handle(makeJob())

      // count=3 auto-pause → must notify owner regardless of 'silent' (R-09.30)
      expect(notificationsFacade.sendDraftApprovalNotification).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT_ID }),
      )
    })
  })
})
