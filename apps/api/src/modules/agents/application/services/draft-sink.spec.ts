import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DraftSink } from './draft-sink'
import type { IDraftRepository } from '../../domain/repositories/draft.repository'
import type { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import type { NotificationsWriteFacade } from '../../../notifications/application/facades/notifications-write.facade'
import type { Draft, NewDraft } from './draft-types'

const TENANT_ID = '01900000-0000-7fff-8000-000000000001'
const INITIATOR = '01900000-0000-7fff-8000-000000000002'
const APPROVER = '01900000-0000-7fff-8000-000000000003'
const DRAFT_ID = '01900000-0000-7fff-8000-000000000004'
const DELEGATION_ID = '01900000-0000-7fff-8000-000000000005'
const TRACE_ID = '01900000-0000-7fff-8000-000000000006'
const FLOW_ID = '01900000-0000-7fff-8000-000000000007'

function makeFakeDraft(overrides: Partial<Draft> = {}): Draft {
  const now = new Date()
  return {
    id: DRAFT_ID,
    tenantId: TENANT_ID,
    traceId: TRACE_ID,
    flowId: FLOW_ID,
    initiatorUserId: INITIATOR,
    onBehalfOf: null,
    viaDelegationId: DELEGATION_ID,
    viaScheduleId: null,
    approverUserId: null,
    tier: 'low_risk_auto',
    status: 'pending',
    toolName: 'planner.createTask',
    args: {},
    expectedOutputShape: null,
    permissionEnvelopeAtDraftTime: {},
    approvalFreshness: 'accept-stale',
    approvalTtl: '72 hours',
    draftedAt: now,
    expiresAt: new Date(now.getTime() + 72 * 3600_000),
    approvedAt: null,
    executedAt: null,
    executionOutcome: null,
    executionOutcomeNote: null,
    provenance: {
      triggered_by: `user:${INITIATOR}`,
      user_utterance: '',
      drafted_at: now,
      derived_from_tainted_sources: [],
    },
    taintAtDraftTime: false,
    ...overrides,
  }
}

describe('DraftSink', () => {
  let draftRepo: IDraftRepository
  let kernelAuditFacade: KernelAuditFacade
  let notificationsWriteFacade: NotificationsWriteFacade
  let sink: DraftSink

  beforeEach(() => {
    draftRepo = {
      insert: vi.fn().mockResolvedValue(makeFakeDraft()),
      getById: vi.fn(),
      updateStatus: vi.fn(),
      listPendingExpired: vi.fn(),
      listForApprover: vi.fn(),
    }

    kernelAuditFacade = {
      recordEvent: vi.fn().mockResolvedValue(undefined),
      publishOutboxEvent: vi.fn(),
      queryAuditLog: vi.fn(),
      exportAuditLog: vi.fn(),
    } as unknown as KernelAuditFacade

    notificationsWriteFacade = {
      sendDraftApprovalNotification: vi.fn().mockResolvedValue(undefined),
    } as unknown as NotificationsWriteFacade

    sink = new DraftSink(draftRepo, kernelAuditFacade, notificationsWriteFacade)
  })

  function baseOpts(overrides: Record<string, unknown> = {}) {
    const now = new Date()
    return {
      tier: 'low_risk_auto' as const,
      provenance: {
        triggered_by: `user:${INITIATOR}`,
        user_utterance: '',
        drafted_at: now,
        derived_from_tainted_sources: [],
      },
      approvalFreshness: 'accept-stale' as const,
      approvalTtlHours: 72,
      tenantId: TENANT_ID,
      traceId: TRACE_ID,
      flowId: FLOW_ID,
      initiatorUserId: INITIATOR,
      approverUserId: null,
      delegationId: DELEGATION_ID,
      permissionEnvelopeAtDraftTime: undefined,
      tainted: false,
      toolName: 'planner.createTask',
      args: { title: 'Do something' },
      summary: 'Create a new task',
      ...overrides,
    }
  }

  it('inserts the draft row and emits an audit event for low-risk tier', async () => {
    const result = await sink.submit(baseOpts())

    expect(result.draftId).toBe(DRAFT_ID)

    expect(draftRepo.insert).toHaveBeenCalledOnce()
    const insertArg = vi.mocked(draftRepo.insert).mock.calls[0][0] as NewDraft
    expect(insertArg.tenantId).toBe(TENANT_ID)
    expect(insertArg.toolName).toBe('planner.createTask')
    expect(insertArg.tier).toBe('low_risk_auto')
    expect(insertArg.viaDelegationId).toBe(DELEGATION_ID)

    expect(kernelAuditFacade.recordEvent).toHaveBeenCalledOnce()
    expect(kernelAuditFacade.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: INITIATOR,
        eventType: 'agent.draft_proposed',
        module: 'agents',
        subjectId: DRAFT_ID,
        payload: expect.objectContaining({
          draftId: DRAFT_ID,
          toolName: 'planner.createTask',
          tier: 'low_risk_auto',
          flowId: FLOW_ID,
        }),
      }),
    )
  })

  it('does not send approval notification for low-risk tier', async () => {
    await sink.submit(baseOpts())

    expect(notificationsWriteFacade.sendDraftApprovalNotification).not.toHaveBeenCalled()
  })

  it('sends approval notification for high-risk tier with approver', async () => {
    vi.mocked(draftRepo.insert).mockResolvedValue(
      makeFakeDraft({ tier: 'high_risk_approval_required', approverUserId: APPROVER }),
    )

    await sink.submit(
      baseOpts({
        tier: 'high_risk_approval_required',
        approverUserId: APPROVER,
      }),
    )

    expect(notificationsWriteFacade.sendDraftApprovalNotification).toHaveBeenCalledOnce()
    expect(notificationsWriteFacade.sendDraftApprovalNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        draftId: DRAFT_ID,
        approverId: APPROVER,
        toolName: 'planner.createTask',
        tier: 'high_risk_approval_required',
      }),
    )
  })

  it('does not send notification for high-risk tier when approverUserId is null', async () => {
    vi.mocked(draftRepo.insert).mockResolvedValue(
      makeFakeDraft({ tier: 'high_risk_approval_required', approverUserId: null }),
    )

    await sink.submit(
      baseOpts({
        tier: 'high_risk_approval_required',
        approverUserId: null,
      }),
    )

    expect(notificationsWriteFacade.sendDraftApprovalNotification).not.toHaveBeenCalled()
  })

  it('defaults permissionEnvelopeAtDraftTime to {} when not provided', async () => {
    await sink.submit(baseOpts({ permissionEnvelopeAtDraftTime: undefined }))

    const insertArg = vi.mocked(draftRepo.insert).mock.calls[0][0] as NewDraft
    expect(insertArg.permissionEnvelopeAtDraftTime).toEqual({})
  })

  it('uses provided permissionEnvelopeAtDraftTime when given', async () => {
    const envelope = { roles: ['planner:task:write'], scopes: ['tenant:abc'] }
    await sink.submit(baseOpts({ permissionEnvelopeAtDraftTime: envelope }))

    const insertArg = vi.mocked(draftRepo.insert).mock.calls[0][0] as NewDraft
    expect(insertArg.permissionEnvelopeAtDraftTime).toEqual(envelope)
  })

  it('includes tainted flag in audit event payload when tainted', async () => {
    vi.mocked(draftRepo.insert).mockResolvedValue(makeFakeDraft({ taintAtDraftTime: true }))

    await sink.submit(baseOpts({ tainted: true }))

    const auditPayload = vi.mocked(kernelAuditFacade.recordEvent).mock.calls[0][0].payload
    expect(auditPayload.tainted).toBe(true)
  })
})
