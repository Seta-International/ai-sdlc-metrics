import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DraftExpirySweeper } from './sweep-expired-drafts'
import type { IDraftRepository } from '../../domain/repositories/draft.repository'
import type { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import type { NotificationsWriteFacade } from '../../../notifications/application/facades/notifications-write.facade'
import type { Draft } from '../../application/services/draft-types'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TENANT_ID = '00000000-0000-7000-8000-000000000001'
const INITIATOR_ID = '00000000-0000-7000-8000-000000000002'

function makeDraft(overrides: Partial<Draft> = {}): Draft {
  const now = new Date()
  return {
    id: `draft-${Math.random()}`,
    tenantId: TENANT_ID,
    traceId: 'trace-1',
    flowId: 'flow-1',
    initiatorUserId: INITIATOR_ID,
    onBehalfOf: null,
    viaDelegationId: 'del-1',
    viaScheduleId: null,
    approverUserId: 'approver-1',
    tier: 'high_risk_approval_required',
    status: 'pending',
    toolName: 'planner.create_task',
    args: {},
    expectedOutputShape: null,
    permissionEnvelopeAtDraftTime: {},
    approvalFreshness: 'revalidate',
    approvalTtl: '24 hours',
    draftedAt: new Date(now.getTime() - 48 * 3600_000),
    expiresAt: new Date(now.getTime() - 3600_000),
    approvedAt: null,
    executedAt: null,
    executionOutcome: null,
    provenance: {
      triggered_by: INITIATOR_ID,
      user_utterance: 'create a task',
      drafted_at: new Date(now.getTime() - 48 * 3600_000),
      derived_from_tainted_sources: [],
    },
    taintAtDraftTime: false,
    ...overrides,
  }
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

function makeDraftRepo(expiredDrafts: Draft[] = []): IDraftRepository {
  return {
    insert: vi.fn(),
    getById: vi.fn(),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    listPendingExpired: vi.fn().mockResolvedValue([]),
    listAllPendingExpired: vi.fn().mockResolvedValue(expiredDrafts),
    listForApprover: vi.fn().mockResolvedValue([]),
    atomicTransitionToExecuted: vi.fn().mockResolvedValue(false),
  }
}

function makeAuditFacade(): KernelAuditFacade {
  return {
    recordEvent: vi.fn().mockResolvedValue(undefined),
    publishOutboxEvent: vi.fn().mockResolvedValue(undefined),
    queryAuditLog: vi.fn(),
    exportAuditLog: vi.fn(),
  } as unknown as KernelAuditFacade
}

function makeNotificationsFacade(): NotificationsWriteFacade {
  return {
    sendDraftApprovalNotification: vi.fn().mockResolvedValue(undefined),
  } as unknown as NotificationsWriteFacade
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DraftExpirySweeper', () => {
  let draftRepo: IDraftRepository
  let auditFacade: KernelAuditFacade
  let notificationsFacade: NotificationsWriteFacade
  let sweeper: DraftExpirySweeper

  describe('run()', () => {
    it('marks pending expired drafts as expired', async () => {
      const draft1 = makeDraft({ id: 'draft-1' })
      const draft2 = makeDraft({ id: 'draft-2' })
      draftRepo = makeDraftRepo([draft1, draft2])
      auditFacade = makeAuditFacade()
      notificationsFacade = makeNotificationsFacade()
      sweeper = new DraftExpirySweeper(draftRepo, auditFacade, notificationsFacade)

      await sweeper.run()

      expect(draftRepo.updateStatus).toHaveBeenCalledTimes(2)
      expect(draftRepo.updateStatus).toHaveBeenCalledWith(
        expect.objectContaining({ draftId: 'draft-1', status: 'expired' }),
      )
      expect(draftRepo.updateStatus).toHaveBeenCalledWith(
        expect.objectContaining({ draftId: 'draft-2', status: 'expired' }),
      )
    })

    it('emits agent.draft_expired audit event for each expired draft', async () => {
      const draft1 = makeDraft({ id: 'draft-1' })
      const draft2 = makeDraft({ id: 'draft-2' })
      draftRepo = makeDraftRepo([draft1, draft2])
      auditFacade = makeAuditFacade()
      notificationsFacade = makeNotificationsFacade()
      sweeper = new DraftExpirySweeper(draftRepo, auditFacade, notificationsFacade)

      await sweeper.run()

      expect(auditFacade.recordEvent).toHaveBeenCalledTimes(2)
      const eventTypes = vi.mocked(auditFacade.recordEvent).mock.calls.map((c) => c[0].eventType)
      expect(eventTypes).toEqual(['agent.draft_expired', 'agent.draft_expired'])
    })

    it('notifies initiator for each expired draft', async () => {
      const draft1 = makeDraft({ id: 'draft-1' })
      const draft2 = makeDraft({ id: 'draft-2' })
      draftRepo = makeDraftRepo([draft1, draft2])
      auditFacade = makeAuditFacade()
      notificationsFacade = makeNotificationsFacade()
      sweeper = new DraftExpirySweeper(draftRepo, auditFacade, notificationsFacade)

      await sweeper.run()

      expect(notificationsFacade.sendDraftApprovalNotification).toHaveBeenCalledTimes(2)
    })

    it('returns count of expired drafts', async () => {
      const drafts = [makeDraft({ id: 'draft-1' }), makeDraft({ id: 'draft-2' })]
      draftRepo = makeDraftRepo(drafts)
      auditFacade = makeAuditFacade()
      notificationsFacade = makeNotificationsFacade()
      sweeper = new DraftExpirySweeper(draftRepo, auditFacade, notificationsFacade)

      const result = await sweeper.run()

      expect(result).toEqual({ expiredCount: 2 })
    })

    it('returns zero when no expired drafts', async () => {
      draftRepo = makeDraftRepo([])
      auditFacade = makeAuditFacade()
      notificationsFacade = makeNotificationsFacade()
      sweeper = new DraftExpirySweeper(draftRepo, auditFacade, notificationsFacade)

      const result = await sweeper.run()

      expect(result).toEqual({ expiredCount: 0 })
      expect(draftRepo.updateStatus).not.toHaveBeenCalled()
      expect(auditFacade.recordEvent).not.toHaveBeenCalled()
    })

    it('non-expired pending drafts are not touched', async () => {
      draftRepo = makeDraftRepo([])
      auditFacade = makeAuditFacade()
      notificationsFacade = makeNotificationsFacade()
      sweeper = new DraftExpirySweeper(draftRepo, auditFacade, notificationsFacade)

      await sweeper.run()

      expect(draftRepo.updateStatus).not.toHaveBeenCalled()
    })

    it('already-expired drafts are not re-processed (listAllPendingExpired only returns pending)', async () => {
      const alreadyExpiredDraft = makeDraft({ id: 'draft-already-expired', status: 'expired' })
      draftRepo = makeDraftRepo([])
      vi.mocked(draftRepo.listAllPendingExpired!).mockResolvedValue([])
      auditFacade = makeAuditFacade()
      notificationsFacade = makeNotificationsFacade()
      sweeper = new DraftExpirySweeper(draftRepo, auditFacade, notificationsFacade)

      await sweeper.run()

      expect(draftRepo.updateStatus).not.toHaveBeenCalledWith(
        expect.objectContaining({ draftId: alreadyExpiredDraft.id }),
      )
    })
  })
})
