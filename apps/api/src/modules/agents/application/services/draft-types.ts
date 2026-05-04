/**
 * Shared draft type contracts.
 * Pure TypeScript — zero NestJS / Drizzle / Zod dependencies.
 */

export type DraftTier = 'low_risk_auto' | 'high_risk_approval_required'

export type Draft = {
  readonly id: string
  readonly tenantId: string
  readonly traceId: string
  readonly flowId: string
  readonly initiatorUserId: string
  readonly onBehalfOf: string | null
  readonly viaDelegationId: string
  readonly viaScheduleId: string | null
  readonly approverUserId: string | null
  readonly tier: DraftTier
  readonly status: DraftStatus
  readonly toolName: string
  readonly args: unknown
  readonly expectedOutputShape: string | null
  readonly permissionEnvelopeAtDraftTime: Record<string, unknown>
  readonly approvalFreshness: ApprovalFreshness
  readonly approvalTtl: string
  readonly draftedAt: Date
  readonly expiresAt: Date
  readonly approvedAt: Date | null
  readonly executedAt: Date | null
  readonly executionOutcome: string | null
  readonly provenance: DraftProvenance
  readonly taintAtDraftTime: boolean
}

export type NewDraft = {
  readonly id?: string
  readonly tenantId: string
  readonly traceId: string
  readonly flowId: string
  readonly initiatorUserId: string
  readonly onBehalfOf?: string | null
  readonly viaDelegationId: string
  readonly viaScheduleId?: string | null
  readonly approverUserId?: string | null
  readonly tier: DraftTier
  readonly toolName: string
  readonly args: unknown
  readonly expectedOutputShape?: string | null
  readonly permissionEnvelopeAtDraftTime: Record<string, unknown>
  readonly approvalFreshness: ApprovalFreshness
  readonly approvalTtlHours: number
  readonly draftedAt: Date
  readonly expiresAt: Date
  readonly provenance: DraftProvenance
  readonly taintAtDraftTime: boolean
}

export type DraftStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'executed'
  | 'execution_failed'
  | 'cancelled'

export type ApprovalFreshness = 'revalidate' | 'accept-stale'

export type TenantApprovalPolicy = {
  readonly tier_overrides_by_tool?: Readonly<Record<string, 'high_risk_approval_required'>>
  /** Hours. Clamped to [1, 168] by the application layer. */
  readonly approval_ttl_override_hours?: number
  readonly approver_escalation_rule?: 'fixed_single' | 'primary_with_delegate'
}

export type DraftProvenance = {
  readonly triggered_by: string
  readonly user_utterance: string
  readonly drafted_at: Date
  readonly derived_from_tainted_sources: ReadonlyArray<{
    readonly tool: string
    readonly refs: ReadonlyArray<string>
    readonly authored_by: string | null
  }>
}

export type DraftProposalResult = {
  readonly draftId: string
  readonly actionId: string
  readonly tier: DraftTier
  readonly requiresApproval: boolean
  // Business-intent language summary: human-readable description of what this
  // draft will do. Never raw args — must be plain-English intent suitable for
  // display in approval UI and audit logs.
  readonly summary: string
  readonly provenance: DraftProvenance
  readonly approvalFreshness: ApprovalFreshness
  readonly approvalTtlHours: number
  // Needed by DraftSink to store via_delegation_id on the draft row. Identifies
  // which delegation (and thus authority) this draft executes under.
  readonly delegationId: string
}
