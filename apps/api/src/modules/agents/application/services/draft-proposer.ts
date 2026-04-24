import { Injectable } from '@nestjs/common'
import { uuidv7 } from 'uuidv7'
import type { AgentToolDescriptor } from '../../../../common/trpc/agent-tool-meta'
import type { TurnState } from './tool-gateway-contracts'
import type { DraftProposalResult, DraftProvenance, TenantApprovalPolicy } from './draft-types'
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
    intentSlug: string
    initiatorUserId: string
    onBehalfOf?: string
    viaScheduleId?: string
    existingDelegationId?: string
    approvalTtlHours?: number
    summary: string
    resolveApprover?: (toolName: string) => Promise<string | null>
    tenantPolicy?: TenantApprovalPolicy
  }): Promise<DraftProposalResult> {
    const { tier } = this.draftTierClassifier.classify({
      tool: opts.toolDescriptor,
      turnState: opts.turnState,
      tenantPolicy: opts.tenantPolicy,
    })

    const approvalTtlHours = opts.approvalTtlHours ?? DEFAULT_APPROVAL_TTL_HOURS
    const draftedAt = new Date()
    const expiresAt = new Date(draftedAt.getTime() + approvalTtlHours * 3600_000)

    const provenance: DraftProvenance = {
      triggered_by: `user:${opts.initiatorUserId}`,
      user_utterance: '',
      drafted_at: draftedAt,
      derived_from_tainted_sources: [],
    }

    const approverUserId = opts.resolveApprover ? await opts.resolveApprover(opts.toolName) : null

    let delegationId: string
    if (opts.viaScheduleId !== undefined && opts.existingDelegationId !== undefined) {
      const existing = await this.kernelDelegationFacade.getDelegation({
        tenantId: opts.tenantId,
        delegationId: opts.existingDelegationId,
      })

      if (existing === null) {
        throw new Error(
          `Delegation ${opts.existingDelegationId} not found for tenant ${opts.tenantId}`,
        )
      }

      if (existing.status !== 'active') {
        throw new Error(
          `Delegation ${opts.existingDelegationId} is not active (status: ${existing.status})`,
        )
      }

      delegationId = existing.id
    } else {
      const actionId = uuidv7()
      const { delegationId: minted } = await this.approvalExecutorDelegationMinter.mintForDraft({
        draftId: actionId,
        tenantId: opts.tenantId,
        initiatorUserId: opts.initiatorUserId,
        toolName: opts.toolName,
        expiresAt,
      })
      delegationId = minted
    }

    const approvalFreshness =
      opts.toolDescriptor.meta.approvalFreshness ?? DEFAULT_APPROVAL_FRESHNESS

    const { draftId } = await this.draftSink.submit({
      tier,
      provenance,
      approvalFreshness,
      approvalTtlHours,
      tenantId: opts.tenantId,
      traceId: opts.traceId,
      flowId: opts.flowId,
      initiatorUserId: opts.initiatorUserId,
      onBehalfOf: opts.onBehalfOf,
      approverUserId,
      delegationId,
      tainted: opts.turnState.tainted.value,
      toolName: opts.toolName,
      args: opts.args,
      viaScheduleId: opts.viaScheduleId,
      summary: opts.summary,
    })

    return {
      draftId,
      actionId: uuidv7(),
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
