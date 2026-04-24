import { uuid, text, timestamp, jsonb, boolean, interval, index } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'
import { agentsSchema } from './agents.schema'

/**
 * Plan 08 — Agent draft (pending action awaiting approval or auto-execution).
 *
 * One row per tool call that an async agent wants to execute.  Low-risk drafts
 * ('low_risk_auto') are executed immediately by the approval-executor without
 * human intervention.  High-risk drafts ('high_risk_approval_required') land in
 * an approver's inbox until approved, rejected, or expired.
 *
 * The `expires_at` column is computed by the application on insert as
 * `drafted_at + approval_ttl` (PostgreSQL 16 generated columns do not support
 * interval arithmetic on non-stored values in all configurations, so we keep it
 * a plain column and set it explicitly).
 */
export const agentDraft = agentsSchema.table(
  'agent_draft',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    /** RLS isolation column — required on every table. */
    tenantId: uuid('tenant_id').notNull(),
    /** OTel trace that produced this draft — links to agent_tool_invocation. */
    traceId: uuid('trace_id').notNull(),
    /** Workflow / planning flow that triggered the draft. */
    flowId: uuid('flow_id').notNull(),
    /** The user whose session initiated the async flow. */
    initiatorUserId: uuid('initiator_user_id').notNull(),
    /**
     * The user on whose behalf the action will be executed.
     * NULL when initiator_user_id == the target principal.
     */
    onBehalfOf: uuid('on_behalf_of'),
    /** agent_delegation.id that authorises this draft. */
    viaDelegationId: uuid('via_delegation_id').notNull(),
    /** Scheduler job id when the draft originates from a scheduled flow. */
    viaScheduleId: uuid('via_schedule_id'),
    /** User who must approve high-risk drafts. NULL for low_risk_auto. */
    approverUserId: uuid('approver_user_id'),
    /**
     * Approval tier:
     *   'low_risk_auto'               — execute without human approval.
     *   'high_risk_approval_required' — block until an approver acts.
     */
    tier: text('tier').notNull(),
    /**
     * Lifecycle status.
     * Allowed values: 'pending' | 'approved' | 'rejected' | 'expired' |
     *                 'executed' | 'execution_failed' | 'cancelled'
     */
    status: text('status').notNull().default('pending'),
    /** Name of the agent tool to be invoked on approval/auto-execution. */
    toolName: text('tool_name').notNull(),
    /** Serialised tool arguments at draft time. */
    args: jsonb('args').notNull(),
    /** JSON Schema / type hint describing what the tool should return. */
    expectedOutputShape: text('expected_output_shape'),
    /**
     * Snapshot of the actor's permission envelope at draft time.
     * Used to re-validate or short-circuit re-validation at execution time.
     */
    permissionEnvelopeAtDraftTime: jsonb('permission_envelope_at_draft_time').notNull().default({}),
    /**
     * Controls whether the executor re-validates the permission envelope:
     *   'revalidate'   — always re-check permissions at execution time.
     *   'accept-stale' — trust the snapshot captured at draft time.
     */
    approvalFreshness: text('approval_freshness').notNull(),
    /**
     * How long this draft remains valid for approval.
     * Default: 72 hours.  After this interval from drafted_at the TTL sweeper
     * transitions status to 'expired'.
     */
    approvalTtl: interval('approval_ttl').notNull().default('72 hours'),
    draftedAt: timestamp('drafted_at', { withTimezone: true }).notNull().defaultNow(),
    /**
     * Computed by the application on insert: drafted_at + approval_ttl.
     * Used by the TTL sweeper index and approval-inbox expiry checks.
     */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    executedAt: timestamp('executed_at', { withTimezone: true }),
    /** Serialised outcome from the tool call (success payload or error). */
    executionOutcome: text('execution_outcome'),
    /**
     * DraftProvenance — captures caller, flow, schedule context.
     * Shape is defined in the domain layer; stored opaquely here.
     */
    provenance: jsonb('provenance').notNull().default({}),
    /**
     * True when any L3.5 scratchpad value read during draft construction was
     * tainted (R-04.33).  Forces the draft into high_risk_approval_required
     * regardless of the tool's base tier.
     */
    taintAtDraftTime: boolean('taint_at_draft_time').notNull().default(false),
  },
  (t) => [
    /** TTL sweeper scans by (tenant, status, expires_at). */
    index('agent_draft_tenant_status_expires_idx').on(t.tenantId, t.status, t.expiresAt),
    /** Approval-inbox queries filter by (tenant, approver, status). */
    index('agent_draft_tenant_approver_status_idx').on(t.tenantId, t.approverUserId, t.status),
    /** Trace correlation — joins with agent_tool_invocation. */
    index('agent_draft_trace_idx').on(t.traceId),
  ],
)

export type AgentDraftRow = typeof agentDraft.$inferSelect
export type NewAgentDraftRow = typeof agentDraft.$inferInsert
