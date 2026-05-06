import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ExecuteApprovedDraftWorker, type ExecuteApprovedDraftJob } from './execute-approved-draft'
import type { IDraftRepository } from '../../domain/repositories/draft.repository'
import type { KernelDelegationFacade } from '../../../kernel/application/facades/kernel-delegation.facade'
import type { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import type { NotificationsWriteFacade } from '../../../notifications/application/facades/notifications-write.facade'
import type { Draft } from '../../application/services/draft-types'

type AgentDelegation = NonNullable<Awaited<ReturnType<KernelDelegationFacade['getDelegation']>>>

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TENANT_ID = '00000000-0000-7000-8000-000000000001'
const DRAFT_ID = '00000000-0000-7000-8000-000000000002'
const DELEGATION_ID = '00000000-0000-7000-8000-000000000003'
const INITIATOR_ID = '00000000-0000-7000-8000-000000000004'
const APPROVER_ID = '00000000-0000-7000-8000-000000000005'
const TRACE_ID = '00000000-0000-7000-8000-000000000006'

function makeJob(overrides: Partial<ExecuteApprovedDraftJob> = {}): ExecuteApprovedDraftJob {
  return {
    draft_id: DRAFT_ID,
    tenant_id: TENANT_ID,
    user_on_behalf_of: INITIATOR_ID,
    delegation_id: DELEGATION_ID,
    tool_name: 'planner.create_task',
    args: { title: 'Do something' },
    permission_envelope_at_draft_time: { read: true, write: true },
    approval_freshness: 'revalidate',
    approved_by: APPROVER_ID,
    approved_at: new Date().toISOString(),
    trace_id: TRACE_ID,
    ...overrides,
  }
}

function makeDraft(overrides: Partial<Draft> = {}): Draft {
  return {
    id: DRAFT_ID,
    tenantId: TENANT_ID,
    traceId: TRACE_ID,
    flowId: 'flow-1',
    initiatorUserId: INITIATOR_ID,
    onBehalfOf: null,
    viaDelegationId: DELEGATION_ID,
    viaScheduleId: null,
    approverUserId: APPROVER_ID,
    tier: 'high_risk_approval_required',
    status: 'approved',
    toolName: 'planner.create_task',
    args: { title: 'Do something' },
    expectedOutputShape: null,
    permissionEnvelopeAtDraftTime: { read: true, write: true },
    approvalFreshness: 'revalidate',
    approvalTtl: '24 hours',
    draftedAt: new Date(),
    expiresAt: new Date(Date.now() + 86400_000),
    approvedAt: new Date(),
    executedAt: null,
    executionOutcome: null,
    executionOutcomeNote: null,
    provenance: {
      triggered_by: INITIATOR_ID,
      user_utterance: 'create a task',
      drafted_at: new Date(),
      derived_from_tainted_sources: [],
    },
    taintAtDraftTime: false,
    ...overrides,
  }
}

function makeDelegation(overrides: Partial<AgentDelegation> = {}): AgentDelegation {
  return {
    id: DELEGATION_ID,
    tenantId: TENANT_ID,
    delegatorUserId: INITIATOR_ID,
    delegate: 'agent:approval-executor',
    scope: { read: true, write: true },
    expiresAt: new Date(Date.now() + 86400_000),
    status: 'active',
    createdAt: new Date(),
    ...overrides,
  }
}

// ── Tenant-context stubs ───────────────────────────────────────────────────────
// Unit tests use fully-mocked repositories so no real DB connection is needed.
// The cls stub calls the handler inline so runWithTenantContext is transparent.
const STUB_CLIENT = {
  query: vi.fn().mockResolvedValue({}),
  release: vi.fn(),
}
const STUB_BASE_DB = {
  $client: { connect: vi.fn().mockResolvedValue(STUB_CLIENT) },
} as never
const STUB_REQUEST_DB_CONTEXT = { setDb: vi.fn(), getDb: vi.fn(), clearDb: vi.fn() } as never
const STUB_CLS = {
  run: vi.fn().mockImplementation((fn: () => unknown) => fn()),
} as never

// ── Mocks ─────────────────────────────────────────────────────────────────────

function makeDraftRepo(overrides: Partial<IDraftRepository> = {}): IDraftRepository {
  return {
    insert: vi.fn(),
    getById: vi.fn().mockResolvedValue(makeDraft()),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    listPendingExpired: vi.fn().mockResolvedValue([]),
    listAllPendingExpired: vi.fn().mockResolvedValue([]),
    listForApprover: vi.fn().mockResolvedValue([]),
    atomicTransitionToExecuted: vi.fn().mockResolvedValue(true),
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

describe('ExecuteApprovedDraftWorker', () => {
  let draftRepo: IDraftRepository
  let delegationFacade: KernelDelegationFacade
  let auditFacade: KernelAuditFacade
  let notificationsFacade: NotificationsWriteFacade
  let worker: ExecuteApprovedDraftWorker

  beforeEach(() => {
    vi.clearAllMocks()
    draftRepo = makeDraftRepo()
    delegationFacade = makeKernelDelegationFacade()
    auditFacade = makeKernelAuditFacade()
    notificationsFacade = makeNotificationsFacade()
    worker = new ExecuteApprovedDraftWorker(
      draftRepo,
      delegationFacade,
      auditFacade,
      notificationsFacade,
      STUB_BASE_DB,
      STUB_REQUEST_DB_CONTEXT,
      STUB_CLS,
    )
  })

  describe('handle()', () => {
    it('happy path: approved draft → sets status to executed', async () => {
      await worker.handle(makeJob())

      expect(draftRepo.atomicTransitionToExecuted).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        draftId: DRAFT_ID,
        fromStatus: 'approved',
      })
      expect(auditFacade.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'agent.draft_executed' }),
      )
    })

    it('idempotence: already-executed draft → no-op (no DB update, no audit)', async () => {
      draftRepo = makeDraftRepo({
        getById: vi.fn().mockResolvedValue(makeDraft({ status: 'executed' })),
      })
      worker = new ExecuteApprovedDraftWorker(
        draftRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
        STUB_BASE_DB,
        STUB_REQUEST_DB_CONTEXT,
        STUB_CLS,
      )

      await worker.handle(makeJob())

      expect(draftRepo.atomicTransitionToExecuted).not.toHaveBeenCalled()
      expect(draftRepo.updateStatus).not.toHaveBeenCalled()
      expect(auditFacade.recordEvent).not.toHaveBeenCalled()
    })

    it('delegation expired → sets execution_failed with outcome delegation_expired, notifies initiator', async () => {
      delegationFacade = makeKernelDelegationFacade({
        getDelegation: vi.fn().mockResolvedValue(makeDelegation({ status: 'expired' })),
      })
      worker = new ExecuteApprovedDraftWorker(
        draftRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
        STUB_BASE_DB,
        STUB_REQUEST_DB_CONTEXT,
        STUB_CLS,
      )

      await worker.handle(makeJob())

      expect(draftRepo.updateStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          draftId: DRAFT_ID,
          status: 'execution_failed',
          extra: expect.objectContaining({ executionOutcome: 'delegation_expired' }),
        }),
      )
      expect(notificationsFacade.sendDraftApprovalNotification).toHaveBeenCalled()
      expect(draftRepo.atomicTransitionToExecuted).not.toHaveBeenCalled()
    })

    it('delegation not found → sets execution_failed with outcome delegation_not_found', async () => {
      delegationFacade = makeKernelDelegationFacade({
        getDelegation: vi.fn().mockResolvedValue(null),
      })
      worker = new ExecuteApprovedDraftWorker(
        draftRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
        STUB_BASE_DB,
        STUB_REQUEST_DB_CONTEXT,
        STUB_CLS,
      )

      await worker.handle(makeJob())

      expect(draftRepo.updateStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          draftId: DRAFT_ID,
          status: 'execution_failed',
          extra: expect.objectContaining({ executionOutcome: 'delegation_not_found' }),
        }),
      )
      expect(draftRepo.atomicTransitionToExecuted).not.toHaveBeenCalled()
    })

    it('permission widened (execute-time > draft-time envelope) → emits permission_widened_between_draft_and_execute audit AND proceeds to execute', async () => {
      const narrowEnvelope = { read: true }
      const widenedEnvelope = { read: true, write: true, admin: true }
      draftRepo = makeDraftRepo({
        getById: vi
          .fn()
          .mockResolvedValue(makeDraft({ permissionEnvelopeAtDraftTime: narrowEnvelope })),
      })
      delegationFacade = makeKernelDelegationFacade({
        getDelegation: vi
          .fn()
          .mockResolvedValue(makeDelegation({ scope: widenedEnvelope as Record<string, unknown> })),
      })
      worker = new ExecuteApprovedDraftWorker(
        draftRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
        STUB_BASE_DB,
        STUB_REQUEST_DB_CONTEXT,
        STUB_CLS,
      )

      await worker.handle(makeJob({ permission_envelope_at_draft_time: narrowEnvelope }))

      const auditCalls = vi.mocked(auditFacade.recordEvent).mock.calls.map((c) => c[0].eventType)
      expect(auditCalls).toContain('permission_widened_between_draft_and_execute')
      expect(auditCalls).toContain('agent.draft_executed')
      expect(draftRepo.atomicTransitionToExecuted).toHaveBeenCalled()
    })

    it('draft not found → logs and returns without any DB update', async () => {
      draftRepo = makeDraftRepo({
        getById: vi.fn().mockResolvedValue(null),
      })
      worker = new ExecuteApprovedDraftWorker(
        draftRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
        STUB_BASE_DB,
        STUB_REQUEST_DB_CONTEXT,
        STUB_CLS,
      )

      await worker.handle(makeJob())

      expect(draftRepo.updateStatus).not.toHaveBeenCalled()
      expect(draftRepo.atomicTransitionToExecuted).not.toHaveBeenCalled()
      expect(auditFacade.recordEvent).not.toHaveBeenCalled()
    })

    it('atomic transition returns false (race condition) → returns without emitting audit', async () => {
      draftRepo = makeDraftRepo({
        atomicTransitionToExecuted: vi.fn().mockResolvedValue(false),
      })
      worker = new ExecuteApprovedDraftWorker(
        draftRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
        STUB_BASE_DB,
        STUB_REQUEST_DB_CONTEXT,
        STUB_CLS,
      )

      await worker.handle(makeJob())

      expect(auditFacade.recordEvent).not.toHaveBeenCalled()
    })

    // ── agent.draft_execution_failed ─────────────────────────────────────

    it('delegation not found → emits agent.draft_execution_failed with outcome delegation_not_found', async () => {
      delegationFacade = makeKernelDelegationFacade({
        getDelegation: vi.fn().mockResolvedValue(null),
      })
      worker = new ExecuteApprovedDraftWorker(
        draftRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
        STUB_BASE_DB,
        STUB_REQUEST_DB_CONTEXT,
        STUB_CLS,
      )

      await worker.handle(makeJob())

      expect(auditFacade.recordEvent).toHaveBeenCalledOnce()
      expect(auditFacade.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          actorId: INITIATOR_ID,
          eventType: 'agent.draft_execution_failed',
          module: 'agents',
          subjectId: DRAFT_ID,
          payload: expect.objectContaining({
            draftId: DRAFT_ID,
            outcome: 'delegation_not_found',
          }),
        }),
      )
    })

    it('delegation expired → emits agent.draft_execution_failed with outcome delegation_expired', async () => {
      delegationFacade = makeKernelDelegationFacade({
        getDelegation: vi.fn().mockResolvedValue(makeDelegation({ status: 'expired' })),
      })
      worker = new ExecuteApprovedDraftWorker(
        draftRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
        STUB_BASE_DB,
        STUB_REQUEST_DB_CONTEXT,
        STUB_CLS,
      )

      await worker.handle(makeJob())

      expect(auditFacade.recordEvent).toHaveBeenCalledOnce()
      expect(auditFacade.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'agent.draft_execution_failed',
          payload: expect.objectContaining({
            draftId: DRAFT_ID,
            outcome: 'delegation_expired',
          }),
        }),
      )
    })

    it('delegation revoked → emits agent.draft_execution_failed with outcome delegation_expired', async () => {
      delegationFacade = makeKernelDelegationFacade({
        getDelegation: vi.fn().mockResolvedValue(makeDelegation({ status: 'revoked' })),
      })
      worker = new ExecuteApprovedDraftWorker(
        draftRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
        STUB_BASE_DB,
        STUB_REQUEST_DB_CONTEXT,
        STUB_CLS,
      )

      await worker.handle(makeJob())

      expect(auditFacade.recordEvent).toHaveBeenCalledOnce()
      expect(auditFacade.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'agent.draft_execution_failed',
          payload: expect.objectContaining({ outcome: 'delegation_expired' }),
        }),
      )
    })

    it('draft not found → does NOT emit agent.draft_execution_failed (nothing to fail)', async () => {
      draftRepo = makeDraftRepo({
        getById: vi.fn().mockResolvedValue(null),
      })
      worker = new ExecuteApprovedDraftWorker(
        draftRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
        STUB_BASE_DB,
        STUB_REQUEST_DB_CONTEXT,
        STUB_CLS,
      )

      await worker.handle(makeJob())

      expect(auditFacade.recordEvent).not.toHaveBeenCalled()
    })

    it('idempotence path (status already executed) → does NOT emit agent.draft_execution_failed', async () => {
      draftRepo = makeDraftRepo({
        getById: vi.fn().mockResolvedValue(makeDraft({ status: 'executed' })),
      })
      worker = new ExecuteApprovedDraftWorker(
        draftRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
        STUB_BASE_DB,
        STUB_REQUEST_DB_CONTEXT,
        STUB_CLS,
      )

      await worker.handle(makeJob())

      expect(auditFacade.recordEvent).not.toHaveBeenCalled()
    })

    it('happy path execution_failed audit event includes traceId and toolName', async () => {
      delegationFacade = makeKernelDelegationFacade({
        getDelegation: vi.fn().mockResolvedValue(null),
      })
      worker = new ExecuteApprovedDraftWorker(
        draftRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
        STUB_BASE_DB,
        STUB_REQUEST_DB_CONTEXT,
        STUB_CLS,
      )

      await worker.handle(makeJob())

      expect(auditFacade.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            traceId: TRACE_ID,
            toolName: 'planner.create_task',
          }),
        }),
      )
    })

    // ── R-08.34: flowId propagation ───────────────────────────────────────

    it('R-08.34: delegation_not_found failure branch propagates flowId from draft to recordEvent', async () => {
      delegationFacade = makeKernelDelegationFacade({
        getDelegation: vi.fn().mockResolvedValue(null),
      })
      worker = new ExecuteApprovedDraftWorker(
        draftRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
        STUB_BASE_DB,
        STUB_REQUEST_DB_CONTEXT,
        STUB_CLS,
      )

      await worker.handle(makeJob())

      expect(auditFacade.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          flowId: 'flow-1',
          eventType: 'agent.draft_execution_failed',
        }),
      )
    })

    it('R-08.34: delegation_expired failure branch propagates flowId from draft to recordEvent', async () => {
      delegationFacade = makeKernelDelegationFacade({
        getDelegation: vi.fn().mockResolvedValue(makeDelegation({ status: 'expired' })),
      })
      worker = new ExecuteApprovedDraftWorker(
        draftRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
        STUB_BASE_DB,
        STUB_REQUEST_DB_CONTEXT,
        STUB_CLS,
      )

      await worker.handle(makeJob())

      expect(auditFacade.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          flowId: 'flow-1',
          eventType: 'agent.draft_execution_failed',
        }),
      )
    })

    // ── R-08.29: on_behalf_of, via_delegation, approved_by in payloads ───

    it('R-08.29: draft_execution_failed payload includes on_behalf_of, via_delegation, approved_by', async () => {
      const ON_BEHALF_OF_ID = '00000000-0000-7000-8000-000000000099'
      const SCHEDULE_ID = '00000000-0000-7000-8000-000000000010'
      draftRepo = makeDraftRepo({
        getById: vi
          .fn()
          .mockResolvedValue(
            makeDraft({ onBehalfOf: ON_BEHALF_OF_ID, viaScheduleId: SCHEDULE_ID }),
          ),
      })
      delegationFacade = makeKernelDelegationFacade({
        getDelegation: vi.fn().mockResolvedValue(null),
      })
      worker = new ExecuteApprovedDraftWorker(
        draftRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
        STUB_BASE_DB,
        STUB_REQUEST_DB_CONTEXT,
        STUB_CLS,
      )
      const job = makeJob({ approved_by: APPROVER_ID })

      await worker.handle(job)

      expect(auditFacade.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'agent.draft_execution_failed',
          payload: expect.objectContaining({
            on_behalf_of: ON_BEHALF_OF_ID,
            via_delegation: DELEGATION_ID,
            via_schedule: SCHEDULE_ID,
            approved_by: APPROVER_ID,
          }),
        }),
      )
    })

    it('R-08.29: draft_execution_failed payload uses initiatorUserId as on_behalf_of when onBehalfOf is null', async () => {
      delegationFacade = makeKernelDelegationFacade({
        getDelegation: vi.fn().mockResolvedValue(null),
      })
      worker = new ExecuteApprovedDraftWorker(
        draftRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
        STUB_BASE_DB,
        STUB_REQUEST_DB_CONTEXT,
        STUB_CLS,
      )

      await worker.handle(makeJob())

      expect(auditFacade.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'agent.draft_execution_failed',
          payload: expect.objectContaining({
            on_behalf_of: INITIATOR_ID,
            via_delegation: DELEGATION_ID,
          }),
        }),
      )
    })

    it('R-08.29: draft_execution_failed omits via_schedule when viaScheduleId is null', async () => {
      delegationFacade = makeKernelDelegationFacade({
        getDelegation: vi.fn().mockResolvedValue(null),
      })
      worker = new ExecuteApprovedDraftWorker(
        draftRepo,
        delegationFacade,
        auditFacade,
        notificationsFacade,
        STUB_BASE_DB,
        STUB_REQUEST_DB_CONTEXT,
        STUB_CLS,
      )

      await worker.handle(makeJob())

      const call = vi.mocked(auditFacade.recordEvent).mock.calls[0][0]
      expect(call.payload).not.toHaveProperty('via_schedule')
    })

    // ── R-08.16: domain revalidation ─────────────────────────────────────────

    it('R-08.16: revalidate path calls the registered revalidator when approval_freshness = revalidate', async () => {
      const revalidator = vi.fn().mockResolvedValue({ ok: true })
      worker.registerRevalidator('planner.create_task', revalidator)

      await worker.handle(makeJob({ approval_freshness: 'revalidate' }))

      expect(revalidator).toHaveBeenCalledOnce()
      expect(revalidator).toHaveBeenCalledWith(
        expect.objectContaining({ toolName: 'planner.create_task', tenantId: TENANT_ID }),
      )
      // Execution proceeds when revalidation passes
      expect(draftRepo.atomicTransitionToExecuted).toHaveBeenCalled()
    })

    it('R-08.16: accept-stale path does NOT call any revalidator', async () => {
      const revalidator = vi.fn().mockResolvedValue({ ok: true })
      worker.registerRevalidator('planner.create_task', revalidator)

      await worker.handle(makeJob({ approval_freshness: 'accept-stale' }))

      expect(revalidator).not.toHaveBeenCalled()
      // Execution still proceeds
      expect(draftRepo.atomicTransitionToExecuted).toHaveBeenCalled()
    })

    it('R-08.16: revalidation failure sets status=execution_failed with outcome=revalidation_failed', async () => {
      const revalidator = vi.fn().mockResolvedValue({ ok: false, reason: 'project was closed' })
      worker.registerRevalidator('planner.create_task', revalidator)

      await worker.handle(makeJob({ approval_freshness: 'revalidate' }))

      // Draft status must be updated to execution_failed
      expect(draftRepo.updateStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          draftId: DRAFT_ID,
          status: 'execution_failed',
          extra: expect.objectContaining({ executionOutcome: 'revalidation_failed' }),
        }),
      )
      // Execution must NOT proceed
      expect(draftRepo.atomicTransitionToExecuted).not.toHaveBeenCalled()
    })

    it('R-08.16: revalidation failure emits agent.draft_execution_failed with outcome=revalidation_failed', async () => {
      const revalidator = vi.fn().mockResolvedValue({ ok: false, reason: 'entity deleted' })
      worker.registerRevalidator('planner.create_task', revalidator)

      await worker.handle(makeJob({ approval_freshness: 'revalidate' }))

      expect(auditFacade.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'agent.draft_execution_failed',
          payload: expect.objectContaining({
            outcome: 'revalidation_failed',
            revalidationFailReason: 'entity deleted',
          }),
        }),
      )
    })

    it('R-08.16: revalidation failure notifies the initiator', async () => {
      const revalidator = vi.fn().mockResolvedValue({ ok: false, reason: 'precondition failed' })
      worker.registerRevalidator('planner.create_task', revalidator)

      await worker.handle(makeJob({ approval_freshness: 'revalidate' }))

      expect(notificationsFacade.sendDraftApprovalNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          draftId: DRAFT_ID,
          approverId: INITIATOR_ID,
        }),
      )
    })

    it('R-08.16: revalidate path with no registered revalidator passes through to execute', async () => {
      // No revalidator registered for the tool
      await worker.handle(makeJob({ approval_freshness: 'revalidate' }))

      // Should still execute — unregistered tool passes validation
      expect(draftRepo.atomicTransitionToExecuted).toHaveBeenCalled()
    })
  })
})
