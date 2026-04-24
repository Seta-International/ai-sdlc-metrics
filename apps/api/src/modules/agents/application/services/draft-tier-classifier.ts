import { Injectable } from '@nestjs/common'
import type { AgentToolDescriptor } from '../../../../common/trpc/agent-tool-meta'
import type { TurnState } from './tool-gateway-contracts'
import type { DraftTier, TenantApprovalPolicy } from './draft-types'

// ─── DraftTierClassifier ──────────────────────────────────────────────────────

@Injectable()
export class DraftTierClassifier {
  /**
   * Classify a tool call into a draft tier.
   *
   * Rules evaluated in priority order — first match wins:
   *   1. approvalRequired === 'always' (unconditional tool-level override)
   *   2. tainted turn + mutation (free-text contamination forces human review)
   *   3. tenant policy upgrade for this specific tool (upgrade-only; cannot downgrade)
   *   4. tool's declared defaultTier (or 'low_risk_auto' when absent)
   */
  classify(opts: {
    tool: AgentToolDescriptor
    turnState: TurnState
    tenantPolicy?: TenantApprovalPolicy
  }): { tier: DraftTier; reason: string } {
    const { tool, turnState, tenantPolicy } = opts

    if (tool.meta.approvalRequired === 'always') {
      return { tier: 'high_risk_approval_required', reason: 'tool_always_requires_approval' }
    }

    if (turnState.tainted.value && tool.procedure === 'mutation') {
      return { tier: 'high_risk_approval_required', reason: 'taint_bump' }
    }

    if (tenantPolicy?.tier_overrides_by_tool?.[tool.name] === 'high_risk_approval_required') {
      return { tier: 'high_risk_approval_required', reason: 'tenant_policy_override' }
    }

    const tier: DraftTier = tool.meta.defaultTier ?? 'low_risk_auto'
    return { tier, reason: 'tool_default' }
  }
}
