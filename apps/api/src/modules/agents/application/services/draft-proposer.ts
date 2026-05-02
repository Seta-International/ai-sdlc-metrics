import { Injectable } from '@nestjs/common'
import { uuidv7 } from 'uuidv7'
import type { AgentToolDescriptor } from '../../../../common/trpc/agent-tool-meta'
import type { TurnState } from './tool-gateway-contracts'
import type {
  ApprovalFreshness,
  DraftProposalResult,
  DraftProvenance,
  TenantApprovalPolicy,
} from './draft-types'
import { DraftTierClassifier } from './draft-tier-classifier'
import { ApprovalExecutorDelegationMinter } from './approval-executor-delegation-minter'
import { DraftSink } from './draft-sink'
import { KernelDelegationFacade } from '../../../kernel/application/facades/kernel-delegation.facade'

/**
 * Sanitize the user utterance when the approver is a different user than the
 * initiator. Strips tokens from the utterance that reference domain
 * objects not visible in the approver's scope by performing a conservative
 * word-level projection: only words that are either common vocabulary (length ≤ 4)
 * or that appear verbatim in the `approverScope` string are retained. Words that
 * are likely entity-specific identifiers or sensitive names are replaced with
 * "[redacted]".
 *
 * This is intentionally conservative — false positives (redacting safe content)
 * are preferred over false negatives (leaking private content).
 *
 * Callers where approver === initiator should pass the raw utterance directly,
 * skipping this function entirely.
 */
export function sanitizeUtteranceForApprover(utterance: string, approverScope: string): string {
  if (!utterance) return utterance
  // Simple word-level projection: keep short words and words present in the scope string.
  const scopeLower = approverScope.toLowerCase()
  return utterance
    .split(/\s+/)
    .map((word) => {
      const clean = word.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
      if (clean.length <= 4) return word
      if (scopeLower.includes(clean)) return word
      return '[redacted]'
    })
    .join(' ')
}

const DEFAULT_APPROVAL_TTL_HOURS = 72
const DEFAULT_APPROVAL_FRESHNESS = 'accept-stale' as const

@Injectable()
export class DraftProposer {
  constructor(
    private readonly draftTierClassifier: DraftTierClassifier,
    private readonly approvalExecutorDelegationMinter: ApprovalExecutorDelegationMinter,
    private readonly draftSink: DraftSink,
    private readonly kernelDelegationFacade: KernelDelegationFacade,
  ) {}

  async propose(opts: {
    toolDescriptor: AgentToolDescriptor
    toolName: string
    args: unknown
    turnState: TurnState
    tenantId: string
    traceId: string
    flowId: string
    initiatorUserId: string
    onBehalfOf?: string
    viaScheduleId?: string
    existingDelegationId?: string
    approvalTtlHours?: number
    summary: string
    resolveApprover?: (toolName: string) => Promise<string | null>
    tenantPolicy?: TenantApprovalPolicy
    approvalFreshness?: ApprovalFreshness
    /**
     * The raw user utterance that triggered this turn.
     * Sanitized via `sanitizeUtteranceForApprover` when the resolved approver
     * differs from the initiator. Raw when approver === initiator.
     */
    userUtterance?: string
  }): Promise<DraftProposalResult> {
    const { tier } = this.draftTierClassifier.classify({
      tool: opts.toolDescriptor,
      turnState: opts.turnState,
      tenantPolicy: opts.tenantPolicy,
    })

    const draftId = uuidv7()
    const approvalTtlHours = opts.approvalTtlHours ?? DEFAULT_APPROVAL_TTL_HOURS
    const draftedAt = new Date()
    const expiresAt = new Date(draftedAt.getTime() + approvalTtlHours * 3600_000)

    const approverUserId =
      tier === 'high_risk_approval_required' && opts.resolveApprover
        ? await opts.resolveApprover(opts.toolName)
        : null

    // Sanitize utterance when approver ≠ initiator.
    const rawUtterance = opts.userUtterance ?? ''
    const sanitizedUtterance =
      approverUserId !== null && approverUserId !== opts.initiatorUserId
        ? sanitizeUtteranceForApprover(rawUtterance, opts.toolName)
        : rawUtterance

    // derived_from_tainted_sources always present; populated from TurnState.taintSources.
    const derivedFromTaintedSources = opts.turnState.taintSources.map((s) => ({
      tool: s.tool,
      refs: s.refs,
      authored_by: s.authored_by,
    }))

    const provenance: DraftProvenance = {
      triggered_by: `user:${opts.initiatorUserId}`,
      user_utterance: sanitizedUtterance,
      drafted_at: draftedAt,
      derived_from_tainted_sources: derivedFromTaintedSources,
    }

    const { tenantId, initiatorUserId, toolName } = opts

    let delegationId: string
    if (opts.viaScheduleId !== undefined) {
      // scheduled context — reuse or verify existing delegation
      if (opts.existingDelegationId) {
        const existing = await this.kernelDelegationFacade.getDelegation({
          tenantId,
          delegationId: opts.existingDelegationId,
        })

        if (existing === null) {
          throw new Error(
            `Delegation ${opts.existingDelegationId} not found for tenant ${tenantId}`,
          )
        }

        if (existing.status !== 'active') {
          throw new Error(
            `Delegation ${opts.existingDelegationId} is not active (status: ${existing.status})`,
          )
        }

        delegationId = existing.id
      } else {
        // scheduled but no prior delegation — mint a new one
        const minted = await this.approvalExecutorDelegationMinter.mintForDraft({
          draftId,
          tenantId,
          initiatorUserId,
          toolName,
          expiresAt,
        })
        delegationId = minted.delegationId
      }
    } else {
      // live session — always mint
      const minted = await this.approvalExecutorDelegationMinter.mintForDraft({
        draftId,
        tenantId,
        initiatorUserId,
        toolName,
        expiresAt,
      })
      delegationId = minted.delegationId
    }

    const approvalFreshness =
      opts.approvalFreshness ??
      opts.toolDescriptor.meta.approvalFreshness ??
      DEFAULT_APPROVAL_FRESHNESS

    await this.draftSink.submit({
      draftId,
      tier,
      provenance,
      approvalFreshness,
      approvalTtlHours,
      expiresAt,
      tenantId,
      traceId: opts.traceId,
      flowId: opts.flowId,
      initiatorUserId,
      onBehalfOf: opts.onBehalfOf,
      approverUserId,
      delegationId,
      tainted: opts.turnState.tainted.value,
      toolName,
      args: opts.args,
      viaScheduleId: opts.viaScheduleId,
      summary: opts.summary,
    })

    return {
      draftId,
      actionId: draftId,
      tier,
      requiresApproval: tier === 'high_risk_approval_required',
      summary: opts.summary,
      provenance,
      approvalFreshness,
      approvalTtlHours,
      delegationId,
    }
  }
}
