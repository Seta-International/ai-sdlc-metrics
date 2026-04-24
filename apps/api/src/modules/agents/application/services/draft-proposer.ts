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

    const provenance: DraftProvenance = {
      triggered_by: `user:${opts.initiatorUserId}`,
      user_utterance: '',
      drafted_at: draftedAt,
      derived_from_tainted_sources: [],
    }

    const approverUserId =
      tier === 'high_risk_approval_required' && opts.resolveApprover
        ? await opts.resolveApprover(opts.toolName)
        : null

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
