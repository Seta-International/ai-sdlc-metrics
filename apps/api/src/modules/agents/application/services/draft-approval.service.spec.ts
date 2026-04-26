import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DraftApprovalService } from './draft-approval.service'
import type { IDraftRepository } from '../../domain/repositories/draft.repository'
import type { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import type { NotificationsWriteFacade } from '../../../notifications/application/facades/notifications-write.facade'
import type { Draft } from './draft-types'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TENANT_ID = '00000000-0000-7000-8000-000000000001'
const DRAFT_ID = '00000000-0000-7000-8000-000000000002'
const DELEGATION_ID = '00000000-0000-7000-8000-000000000003'
const INITIATOR_ID = '00000000-0000-7000-8000-000000000004'
const APPROVER_ID = '00000000-0000-7000-8000-000000000005'
const TRACE_ID = '00000000-0000-7000-8000-000000000006'
const FLOW_ID = '00000000-0000-7000-8000-000000000007'
const EXECUTION_JOB_ID = 'agents.execute-approved-draft'

function makePendingDraft(overrides: Partial<Draft> = {}): Draft {
  return {
    id: DRAFT_ID,
    tenantId: TENANT_ID,
    traceId: TRACE_ID,
    flowId: FLOW_ID,
    initiatorUserId: INITIATOR_ID,
    onBehalfOf: null,
    viaDelegationId: DELEGATION_ID,
    viaScheduleId: null,
    approverUserId: APPROVER_ID,
    tier: 'high_risk_approval_required',
    status: 'pending',
    toolName: 'planner.create_task',
    args: { title: 'Do something' },
    expectedOutputShape: null,
    permissionEnvelopeAtDraftTime: { read: true, write: true },
    approvalFreshness: 'revalidate',
    approvalTtl: '72 hours',
    draftedAt: new Date(),
    expiresAt: new Date(Date.now() + 72 * 3600_000),
    approvedAt: null,
    executedAt: null,
    executionOutcome: null,
    provenance: {
      triggered_by: `user:${INITIATOR_ID}`,
      user_utterance: 'create a task',
      drafted_at: new Date(),
      derived_from_tainted_sources: [],
    },
    taintAtDraftTime: false,
    ...overrides,
  }
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

function makeDraftRepo(overrides: Partial<IDraftRepository> = {}): IDraftRepository {
  return {
    insert: vi.fn(),
    getById: vi.fn().mockResolvedValue(makePendingDraft()),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    listPendingExpired: vi.fn().mockResolvedValue([]),
    listAllPendingExpired: vi.fn().mockResolvedValue([]),
    listForApprover: vi.fn().mockResolvedValue([]),
    atomicTransitionToExecuted: vi.fn().mockResolvedValue(true),
    listAuditDrafts: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    ...overrides,
  }
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

type EnqueueFn = (jobName: string, data: unknown) => Promise<void>

function makeEnqueue(): EnqueueFn {
  return vi.fn().mockResolvedValue(undefined)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DraftApprovalService', () => {
  let draftRepo: IDraftRepository
  let auditFacade: KernelAuditFacade
  let notificationsFacade: NotificationsWriteFacade
  let enqueue: EnqueueFn
  let service: DraftApprovalService

  beforeEach(() => {
    vi.clearAllMocks()
    draftRepo = makeDraftRepo()
    auditFacade = makeKernelAuditFacade()
    notificationsFacade = makeNotificationsFacade()
    enqueue = makeEnqueue()
    service = new DraftApprovalService(draftRepo, auditFacade, notificationsFacade, enqueue)
  })

  // ── approveDraft ──────────────────────────────────────────────────────────

  describe('approveDraft()', () => {
    it('happy path: updates status to approved and emits agent.draft_approved', async () => {
      await service.approveDraft({
        tenantId: TENANT_ID,
        draftId: DRAFT_ID,
        approverId: APPROVER_ID,
      })

      expect(draftRepo.updateStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          draftId: DRAFT_ID,
          status: 'approved',
          extra: expect.objectContaining({ approvedAt: expect.any(Date) }),
        }),
      )

      expect(auditFacade.recordEvent).toHaveBeenCalledOnce()
      expect(auditFacade.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          actorId: APPROVER_ID,
          eventType: 'agent.draft_approved',
          module: 'agents',
          subjectId: DRAFT_ID,
          payload: expect.objectContaining({
            draftId: DRAFT_ID,
            toolName: 'planner.create_task',
            tier: 'high_risk_approval_required',
            flowId: FLOW_ID,
          }),
        }),
      )
    })

    it('happy path: enqueues execute-approved-draft job after approval', async () => {
      await service.approveDraft({
        tenantId: TENANT_ID,
        draftId: DRAFT_ID,
        approverId: APPROVER_ID,
      })

      expect(enqueue).toHaveBeenCalledWith(
        'agents.execute-approved-draft',
        expect.objectContaining({
          draft_id: DRAFT_ID,
          tenant_id: TENANT_ID,
          approved_by: APPROVER_ID,
          delegation_id: DELEGATION_ID,
          tool_name: 'planner.create_task',
        }),
      )
    })

    it('draft not found → throws, does NOT emit audit event', async () => {
      draftRepo = makeDraftRepo({
        getById: vi.fn().mockResolvedValue(null),
      })
      service = new DraftApprovalService(draftRepo, auditFacade, notificationsFacade, enqueue)

      await expect(
        service.approveDraft({ tenantId: TENANT_ID, draftId: DRAFT_ID, approverId: APPROVER_ID }),
      ).rejects.toThrow()

      expect(auditFacade.recordEvent).not.toHaveBeenCalled()
    })

    it('draft not in pending status → throws, does NOT emit audit event', async () => {
      draftRepo = makeDraftRepo({
        getById: vi.fn().mockResolvedValue(makePendingDraft({ status: 'approved' })),
      })
      service = new DraftApprovalService(draftRepo, auditFacade, notificationsFacade, enqueue)

      await expect(
        service.approveDraft({ tenantId: TENANT_ID, draftId: DRAFT_ID, approverId: APPROVER_ID }),
      ).rejects.toThrow()

      expect(auditFacade.recordEvent).not.toHaveBeenCalled()
    })

    it('flowId is passed to audit event', async () => {
      await service.approveDraft({
        tenantId: TENANT_ID,
        draftId: DRAFT_ID,
        approverId: APPROVER_ID,
      })

      const call = vi.mocked(auditFacade.recordEvent).mock.calls[0][0]
      expect(call.flowId).toBe(FLOW_ID)
    })
  })

  // ── rejectDraft ───────────────────────────────────────────────────────────

  describe('rejectDraft()', () => {
    it('happy path: updates status to rejected and emits agent.draft_rejected', async () => {
      await service.rejectDraft({
        tenantId: TENANT_ID,
        draftId: DRAFT_ID,
        rejecterId: APPROVER_ID,
        reason: 'not_needed',
      })

      expect(draftRepo.updateStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          draftId: DRAFT_ID,
          status: 'rejected',
        }),
      )

      expect(auditFacade.recordEvent).toHaveBeenCalledOnce()
      expect(auditFacade.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          actorId: APPROVER_ID,
          eventType: 'agent.draft_rejected',
          module: 'agents',
          subjectId: DRAFT_ID,
          payload: expect.objectContaining({
            draftId: DRAFT_ID,
            toolName: 'planner.create_task',
            tier: 'high_risk_approval_required',
            flowId: FLOW_ID,
            reason: 'not_needed',
          }),
        }),
      )
    })

    it('happy path: notifies initiator after rejection', async () => {
      await service.rejectDraft({
        tenantId: TENANT_ID,
        draftId: DRAFT_ID,
        rejecterId: APPROVER_ID,
        reason: 'wrong_entity',
      })

      expect(notificationsFacade.sendDraftApprovalNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          draftId: DRAFT_ID,
          approverId: INITIATOR_ID,
        }),
      )
    })

    it('draft not found → throws, does NOT emit audit event', async () => {
      draftRepo = makeDraftRepo({
        getById: vi.fn().mockResolvedValue(null),
      })
      service = new DraftApprovalService(draftRepo, auditFacade, notificationsFacade, enqueue)

      await expect(
        service.rejectDraft({
          tenantId: TENANT_ID,
          draftId: DRAFT_ID,
          rejecterId: APPROVER_ID,
          reason: 'not_needed',
        }),
      ).rejects.toThrow()

      expect(auditFacade.recordEvent).not.toHaveBeenCalled()
    })

    it('draft not in pending status → throws, does NOT emit audit event', async () => {
      draftRepo = makeDraftRepo({
        getById: vi.fn().mockResolvedValue(makePendingDraft({ status: 'rejected' })),
      })
      service = new DraftApprovalService(draftRepo, auditFacade, notificationsFacade, enqueue)

      await expect(
        service.rejectDraft({
          tenantId: TENANT_ID,
          draftId: DRAFT_ID,
          rejecterId: APPROVER_ID,
          reason: 'not_needed',
        }),
      ).rejects.toThrow()

      expect(auditFacade.recordEvent).not.toHaveBeenCalled()
    })

    it('flowId is passed to audit event', async () => {
      await service.rejectDraft({
        tenantId: TENANT_ID,
        draftId: DRAFT_ID,
        rejecterId: APPROVER_ID,
        reason: 'other_with_note',
      })

      const call = vi.mocked(auditFacade.recordEvent).mock.calls[0][0]
      expect(call.flowId).toBe(FLOW_ID)
    })

    it('rejection does NOT enqueue execute-approved-draft job', async () => {
      await service.rejectDraft({
        tenantId: TENANT_ID,
        draftId: DRAFT_ID,
        rejecterId: APPROVER_ID,
        reason: 'not_needed',
      })

      expect(enqueue).not.toHaveBeenCalledWith(EXECUTION_JOB_ID, expect.anything())
    })
  })
})
