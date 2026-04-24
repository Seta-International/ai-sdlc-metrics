import { Injectable } from '@nestjs/common'
import type { AgentToolMeta } from '../../../../common/trpc/agent-tool-meta'
import type { ApprovalFreshness } from './draft-types'

// ─── Types ────────────────────────────────────────────────────────────────────

export type FlowPolicyEntry = {
  readonly intent_slug: string
  readonly approvalFreshness?: ApprovalFreshness
  readonly approvalTtlHours?: number
  /** Shorthand for approvalFreshness: 'revalidate' — kept separate for semantic clarity. */
  readonly requireFresh?: boolean
  readonly bump?: 'high_risk_approval_required'
}

export type EffectivePolicy = {
  readonly approvalFreshness: ApprovalFreshness
  readonly approvalTtlHours: number
  readonly tierBump?: 'high_risk_approval_required'
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_APPROVAL_TTL_HOURS = 72
const DEFAULT_APPROVAL_FRESHNESS: ApprovalFreshness = 'accept-stale'

const FRESHNESS_RANK: Record<ApprovalFreshness, number> = {
  'accept-stale': 0,
  revalidate: 1,
}

// ─── FlowPolicyResolver ───────────────────────────────────────────────────────

@Injectable()
export class FlowPolicyResolver {
  private readonly registry = new Map<string, FlowPolicyEntry>()

  registerPolicy(entry: FlowPolicyEntry): void {
    this.registry.set(entry.intent_slug, entry)
  }

  /**
   * Merge flow-policy entry with tool-meta defaults using most-strict-wins rules:
   *   - approvalFreshness: max('accept-stale' < 'revalidate'); requireFresh forces 'revalidate'
   *   - approvalTtlHours: min(flow, tool); default 72
   *   - tierBump: present if flow declares it
   */
  resolve(intentSlug: string, toolMeta: AgentToolMeta): EffectivePolicy {
    const flow = this.registry.get(intentSlug)

    const toolFreshness: ApprovalFreshness =
      toolMeta.approvalFreshness ?? DEFAULT_APPROVAL_FRESHNESS
    const toolTtl = parseApprovalTtlHours(toolMeta.approvalTtl) ?? DEFAULT_APPROVAL_TTL_HOURS

    if (flow === undefined) {
      return {
        approvalFreshness: toolFreshness,
        approvalTtlHours: toolTtl,
      }
    }

    const effectiveFreshness = resolveApprovalFreshness(flow, toolFreshness)
    const effectiveTtl = resolveApprovalTtlHours(flow.approvalTtlHours, toolTtl)

    return {
      approvalFreshness: effectiveFreshness,
      approvalTtlHours: effectiveTtl,
      ...(flow.bump !== undefined ? { tierBump: flow.bump } : {}),
    }
  }
}

// ─── Private helpers ──────────────────────────────────────────────────────────

/** Parse "72h" → 72, "48h" → 48. Returns undefined when input is absent or malformed. */
function parseApprovalTtlHours(ttl: string | undefined): number | undefined {
  if (ttl === undefined) return undefined
  const match = /^(\d+)h$/i.exec(ttl)
  if (match === null) return undefined
  return parseInt(match[1], 10)
}

function resolveApprovalFreshness(
  flow: FlowPolicyEntry,
  toolFreshness: ApprovalFreshness,
): ApprovalFreshness {
  if (flow.requireFresh === true) return 'revalidate'
  if (flow.approvalFreshness === undefined) return toolFreshness

  return FRESHNESS_RANK[flow.approvalFreshness] > FRESHNESS_RANK[toolFreshness]
    ? flow.approvalFreshness
    : toolFreshness
}

function resolveApprovalTtlHours(flowTtl: number | undefined, toolTtl: number): number {
  if (flowTtl === undefined) return toolTtl
  return Math.min(flowTtl, toolTtl)
}
