import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DraftProposer } from './draft-proposer'
import type { DraftTierClassifier } from './draft-tier-classifier'
import type { ApprovalExecutorDelegationMinter } from './approval-executor-delegation-minter'
import type { DraftSink } from './draft-sink'
import type { KernelDelegationFacade } from '../../../kernel/application/facades/kernel-delegation.facade'
import type { AgentToolDescriptor } from '../../../../common/trpc/agent-tool-meta'
import type { TurnState } from './tool-gateway-contracts'
type FakeDelegation = {
  id: string
  tenantId: string
  delegatorUserId: string
  delegate: string
  scope: Record<string, unknown>
  expiresAt: Date
  status: 'active' | 'expired' | 'revoked'
  createdAt: Date
}

const TENANT_ID = '01900000-0000-7fff-8000-000000000001'
const USER_ID = '01900000-0000-7fff-8000-000000000002'
const DRAFT_ID = '01900000-0000-7fff-8000-000000000003'
const DELEGATION_ID = '01900000-0000-7fff-8000-000000000004'
const SCHEDULE_ID = '01900000-0000-7fff-8000-000000000005'
const TRACE_ID = '01900000-0000-7fff-8000-000000000006'
const FLOW_ID = '01900000-0000-7fff-8000-000000000007'

const TOOL_DESCRIPTOR: AgentToolDescriptor = {
  name: 'planner.createTask',
  procedure: 'mutation',
  permission: 'planner:task:write',
  inputSchema: {},
  outputSchema: {},
  meta: {
    whenToUse: 'Use to create a task',
    whenNotToUse: '',
    examples: [],
    defaultTier: 'low_risk_auto',
  },
}

function makeTurnState(tainted = false): TurnState {
  return {
    tainted: { value: tainted },
    taintSources: [],
    circuitBreaker: new Map(),
    retryCount: new Map(),
    toolCeilingRemaining: new Map(),
    l1Cache: null as never,
  }
}

function makeActiveDelegation(id: string): FakeDelegation {
  return {
    id,
    tenantId: TENANT_ID,
    delegatorUserId: USER_ID,
    delegate: 'agent:approval-executor',
    scope: { draftId: DRAFT_ID, toolName: 'planner.createTask' },
    expiresAt: new Date(Date.now() + 72 * 3600_000),
    status: 'active',
    createdAt: new Date(),
  }
}

describe('DraftProposer', () => {
  let classifier: DraftTierClassifier
  let minter: ApprovalExecutorDelegationMinter
  let sink: DraftSink
  let kernelDelegationFacade: KernelDelegationFacade
  let proposer: DraftProposer

  beforeEach(() => {
    classifier = {
      classify: vi.fn().mockReturnValue({ tier: 'low_risk_auto', reason: 'tool_default' }),
    } as unknown as DraftTierClassifier

    minter = {
      mintForDraft: vi.fn().mockResolvedValue({ delegationId: DELEGATION_ID }),
    } as unknown as ApprovalExecutorDelegationMinter

    sink = {
      submit: vi.fn().mockResolvedValue({ draftId: DRAFT_ID }),
    } as unknown as DraftSink

    kernelDelegationFacade = {
      getDelegation: vi.fn().mockResolvedValue(makeActiveDelegation(DELEGATION_ID)),
      createDelegation: vi.fn(),
      revokeDelegation: vi.fn(),
    } as unknown as KernelDelegationFacade

    proposer = new DraftProposer(classifier, minter, sink, kernelDelegationFacade)
  })

  function baseOpts(overrides: Record<string, unknown> = {}) {
    return {
      toolDescriptor: TOOL_DESCRIPTOR,
      toolName: 'planner.createTask',
      args: { title: 'Build the feature' },
      turnState: makeTurnState(),
      tenantId: TENANT_ID,
      traceId: TRACE_ID,
      flowId: FLOW_ID,
      initiatorUserId: USER_ID,
      summary: 'Create a task to build the feature',
      ...overrides,
    }
  }

  it('calls DraftTierClassifier with the correct tool and turnState', async () => {
    await proposer.propose(baseOpts())

    expect(classifier.classify).toHaveBeenCalledOnce()
    expect(classifier.classify).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: TOOL_DESCRIPTOR,
        turnState: expect.objectContaining({ tainted: { value: false } }),
      }),
    )
  })

  it('passes tenantPolicy to DraftTierClassifier when provided', async () => {
    const tenantPolicy = {
      tier_overrides_by_tool: { 'planner.createTask': 'high_risk_approval_required' as const },
    }
    await proposer.propose(baseOpts({ tenantPolicy }))

    expect(classifier.classify).toHaveBeenCalledWith(expect.objectContaining({ tenantPolicy }))
  })

  it('builds provenance with triggered_by = user: + initiatorUserId', async () => {
    await proposer.propose(baseOpts())

    const submitArg = vi.mocked(sink.submit).mock.calls[0][0]
    expect(submitArg.provenance.triggered_by).toBe(`user:${USER_ID}`)
    expect(submitArg.provenance.user_utterance).toBe('')
    expect(submitArg.provenance.derived_from_tainted_sources).toEqual([])
    expect(submitArg.provenance.drafted_at).toBeInstanceOf(Date)
  })

  // ── R-08.2: provenance.user_utterance + derived_from_tainted_sources ─────

  it('R-08.2: user_utterance populated from opts.userUtterance when initiator approves own draft', async () => {
    const result = await proposer.propose(
      baseOpts({ userUtterance: 'Create a task for onboarding' }),
    )

    const submitArg = vi.mocked(sink.submit).mock.calls[0][0]
    // Low-risk → no approver → approverUserId === null → initiator IS approver → raw utterance
    expect(submitArg.provenance.user_utterance).toBe('Create a task for onboarding')
    expect(result.provenance.user_utterance).toBe('Create a task for onboarding')
  })

  it('R-08.2: derived_from_tainted_sources populated from turnState.taintSources', async () => {
    const taintedTurnState = makeTurnState()
    taintedTurnState.taintSources.push(
      { tool: 'people.getProfile', refs: ['bio', 'notes'], authored_by: 'alice' },
      { tool: 'planner.getTask', refs: ['description'], authored_by: null },
    )

    await proposer.propose(baseOpts({ turnState: taintedTurnState }))

    const submitArg = vi.mocked(sink.submit).mock.calls[0][0]
    expect(submitArg.provenance.derived_from_tainted_sources).toEqual([
      { tool: 'people.getProfile', refs: ['bio', 'notes'], authored_by: 'alice' },
      { tool: 'planner.getTask', refs: ['description'], authored_by: null },
    ])
  })

  it('R-08.24: user_utterance sanitized when approver !== initiator', async () => {
    const APPROVER_ID = '01900000-0000-7fff-8000-000000000099'
    vi.mocked(classifier.classify).mockReturnValue({
      tier: 'high_risk_approval_required',
      reason: 'tool_always_requires_approval',
    })
    const resolveApprover = vi.fn().mockResolvedValue(APPROVER_ID)

    await proposer.propose(
      baseOpts({
        userUtterance: 'Please update Alice personal details in system',
        resolveApprover,
      }),
    )

    const submitArg = vi.mocked(sink.submit).mock.calls[0][0]
    // Approver !== initiator → sanitized utterance; "Alice" and "personal" and "details" are
    // long words not in the tool scope string so they should be redacted.
    expect(submitArg.provenance.user_utterance).not.toContain('Alice')
  })

  it('R-08.24: user_utterance NOT sanitized when approver === initiator', async () => {
    vi.mocked(classifier.classify).mockReturnValue({
      tier: 'high_risk_approval_required',
      reason: 'tool_always_requires_approval',
    })
    // Approver = same user as initiator
    const resolveApprover = vi.fn().mockResolvedValue(USER_ID)

    await proposer.propose(
      baseOpts({
        userUtterance: 'Create a task for Alice',
        resolveApprover,
      }),
    )

    const submitArg = vi.mocked(sink.submit).mock.calls[0][0]
    // Approver === initiator → raw utterance
    expect(submitArg.provenance.user_utterance).toBe('Create a task for Alice')
  })

  it('mints a new delegation for a live session (no viaScheduleId)', async () => {
    await proposer.propose(baseOpts())

    expect(minter.mintForDraft).toHaveBeenCalledOnce()
    expect(kernelDelegationFacade.getDelegation).not.toHaveBeenCalled()
  })

  it('reuses existing delegation when viaScheduleId + existingDelegationId provided', async () => {
    await proposer.propose(
      baseOpts({
        viaScheduleId: SCHEDULE_ID,
        existingDelegationId: DELEGATION_ID,
      }),
    )

    expect(minter.mintForDraft).not.toHaveBeenCalled()
    expect(kernelDelegationFacade.getDelegation).toHaveBeenCalledOnce()
    expect(kernelDelegationFacade.getDelegation).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      delegationId: DELEGATION_ID,
    })
  })

  it('mints a new delegation when viaScheduleId present but existingDelegationId absent', async () => {
    await proposer.propose(
      baseOpts({
        viaScheduleId: SCHEDULE_ID,
        // no existingDelegationId
      }),
    )

    expect(minter.mintForDraft).toHaveBeenCalledOnce()
    expect(kernelDelegationFacade.getDelegation).not.toHaveBeenCalled()
  })

  it('throws when existing delegation is not active', async () => {
    vi.mocked(kernelDelegationFacade.getDelegation).mockResolvedValue({
      ...makeActiveDelegation(DELEGATION_ID),
      status: 'expired',
    })

    await expect(
      proposer.propose(
        baseOpts({
          viaScheduleId: SCHEDULE_ID,
          existingDelegationId: DELEGATION_ID,
        }),
      ),
    ).rejects.toThrow(/delegation.*not.*active|expired|invalid/i)
  })

  it('throws when existing delegation is not found', async () => {
    vi.mocked(kernelDelegationFacade.getDelegation).mockResolvedValue(null)

    await expect(
      proposer.propose(
        baseOpts({
          viaScheduleId: SCHEDULE_ID,
          existingDelegationId: DELEGATION_ID,
        }),
      ),
    ).rejects.toThrow()
  })

  it('returns a fully populated DraftProposalResult with actionId equal to draftId', async () => {
    const result = await proposer.propose(baseOpts())

    // actionId must be the same value as draftId (correlation handle)
    expect(result.actionId).toBe(result.draftId)
    expect(result.actionId).toBeTruthy()
    expect(result.tier).toBe('low_risk_auto')
    expect(result.requiresApproval).toBe(false)
    expect(result.summary).toBe('Create a task to build the feature')
    expect(result.delegationId).toBe(DELEGATION_ID)
    expect(result.approvalFreshness).toBeDefined()
    expect(result.approvalTtlHours).toBeTypeOf('number')
    expect(result.provenance).toBeDefined()
  })

  it('sets requiresApproval=true for high_risk_approval_required tier', async () => {
    vi.mocked(classifier.classify).mockReturnValue({
      tier: 'high_risk_approval_required',
      reason: 'tool_always_requires_approval',
    })

    const result = await proposer.propose(baseOpts())

    expect(result.tier).toBe('high_risk_approval_required')
    expect(result.requiresApproval).toBe(true)
  })

  it('does not call resolveApprover for low_risk_auto tier even when provided', async () => {
    const resolveApprover = vi.fn().mockResolvedValue('some-approver-id')

    await proposer.propose(baseOpts({ resolveApprover }))

    expect(resolveApprover).not.toHaveBeenCalled()

    const submitArg = vi.mocked(sink.submit).mock.calls[0][0]
    expect(submitArg.approverUserId).toBeNull()
  })

  it('calls resolveApprover only for high_risk_approval_required tier', async () => {
    vi.mocked(classifier.classify).mockReturnValue({
      tier: 'high_risk_approval_required',
      reason: 'tool_always_requires_approval',
    })
    const resolveApprover = vi.fn().mockResolvedValue('some-approver-id')

    await proposer.propose(baseOpts({ resolveApprover }))

    expect(resolveApprover).toHaveBeenCalledWith('planner.createTask')

    const submitArg = vi.mocked(sink.submit).mock.calls[0][0]
    expect(submitArg.approverUserId).toBe('some-approver-id')
  })

  it('uses flow-level approvalFreshness when provided in opts', async () => {
    const result = await proposer.propose(baseOpts({ approvalFreshness: 'revalidate' }))

    expect(result.approvalFreshness).toBe('revalidate')

    const submitArg = vi.mocked(sink.submit).mock.calls[0][0]
    expect(submitArg.approvalFreshness).toBe('revalidate')
  })

  it('prefers opts.approvalFreshness over toolDescriptor.meta.approvalFreshness', async () => {
    const toolWithMeta = {
      ...TOOL_DESCRIPTOR,
      meta: {
        ...TOOL_DESCRIPTOR.meta,
        approvalFreshness: 'accept-stale' as const,
      },
    }

    const result = await proposer.propose(
      baseOpts({
        toolDescriptor: toolWithMeta,
        approvalFreshness: 'revalidate',
      }),
    )

    expect(result.approvalFreshness).toBe('revalidate')

    const submitArg = vi.mocked(sink.submit).mock.calls[0][0]
    expect(submitArg.approvalFreshness).toBe('revalidate')
  })

  it('falls back to toolDescriptor.meta.approvalFreshness when opts.approvalFreshness absent', async () => {
    const toolWithMeta = {
      ...TOOL_DESCRIPTOR,
      meta: {
        ...TOOL_DESCRIPTOR.meta,
        approvalFreshness: 'revalidate' as const,
      },
    }

    const result = await proposer.propose(
      baseOpts({
        toolDescriptor: toolWithMeta,
        // no approvalFreshness in opts
      }),
    )

    expect(result.approvalFreshness).toBe('revalidate')

    const submitArg = vi.mocked(sink.submit).mock.calls[0][0]
    expect(submitArg.approvalFreshness).toBe('revalidate')
  })
})
