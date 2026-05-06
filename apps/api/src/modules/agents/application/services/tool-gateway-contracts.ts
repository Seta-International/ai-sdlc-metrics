/**
 * Pure type contracts for the ToolGateway pipeline runtime input.
 * No classes, no NestJS decorators, no side effects.
 */

import type { L1Cache } from '../../infrastructure/cache/l1-cache'
import type { IntentSlug } from './flow-id-propagation'
import type { TurnPolicy } from '../../domain/value-objects/turn-policy'
import type { ToolGatewayResult } from '../../infrastructure/guards/tripwire'

/**
 * Caller identity + tracing metadata threaded through every gateway invocation.
 */
export interface RequestContext {
  readonly tenantId: string
  readonly userId: string
  readonly traceId: string
  /** Surface (e.g. 'web', 'api', 'scheduler') from which the agent turn originated. */
  readonly surface: string
  /** Optional delegation chain UUID when acting on behalf of another principal. */
  readonly delegationId?: string
}

/**
 * A single taint source entry — records which tool call introduced tenant-authored
 * free text into the LLM context.
 */
export interface TaintSource {
  /** The tool whose result contained tenant-authored free text. */
  readonly tool: string
  /** Field refs from the tainted tool result (e.g. ["body", "title"]). */
  readonly refs: ReadonlyArray<string>
  /** User who authored the tainted content, if determinable. */
  readonly authored_by: string | null
}

/**
 * Mutable bag passed through every tool invocation in a single sub-agent turn.
 * Lifetime: one sub-agent execution; never shared across sub-agents.
 */
export interface TurnState {
  /**
   * Mutable wrapper ref so any pipeline step can flip tainted to true.
   * A tainted turn means tenant-authored free text was included in LLM context.
   */
  readonly tainted: { value: boolean }

  /**
   * Ordered list of taint sources accumulated during this sub-agent turn.
   * Populated by the taint-wrap pipeline step when `tainted.value` is flipped.
   * Consumed by DraftProposer to populate `provenance.derived_from_tainted_sources`.
   * Mutable array — pipeline steps push entries; never reassigned.
   */
  readonly taintSources: TaintSource[]

  /**
   * Per-tool circuit-breaker state within this sub-agent turn.
   * Key: toolName. `brokenAt` is a Unix epoch ms timestamp.
   * `breachedVariant` records which ceiling variant tripped the breaker so the
   * re-invocation tripwire uses the correct variant (bytes vs wallclock).
   */
  readonly circuitBreaker: Map<
    string,
    {
      permissionDenied?: boolean
      ceilingBreached?: true
      breachedVariant?: 'ceiling_breach_bytes' | 'ceiling_breach_wallclock'
      brokenAt: number
    }
  >

  /**
   * Per-tool retry counter. Gateway tracks this for ceiling-retry and validation-retry.
   * 2 total retries across the turn → tripwire downgrades to abort on subsequent breaches.
   */
  readonly retryCount: Map<string, number>

  /**
   * Remaining ceiling budget per tool within this turn.
   * Decremented by each successful invocation.
   */
  readonly toolCeilingRemaining: Map<
    string,
    {
      bytes?: number
      wallclockMs?: number
    }
  >

  /**
   * Turn-scoped L1 read cache with in-flight promise coalescing.
   * One instance per (turn, sub-agent) pair — created by the orchestrator.
   */
  readonly l1Cache: L1Cache
}

/**
 * The full input shape for a single `ToolGateway.invoke()` call.
 */
export interface ToolGatewayInvokeInput {
  readonly toolName: string
  readonly args: unknown
  readonly subAgentKey: string
  /**
   * Permission-key prefixes this sub-agent is allowed to call.
   * Example: `['planner:task', 'people:profile:read']`.
   * The gateway passes this to `resolve()` to enforce sub-agent scope isolation.
   * Provided by the AgentRuntime when building the per-turn invoke function;
   * sourced from the sub-agent config in the DB.
   */
  readonly subAgentScope: ReadonlyArray<string>
  readonly requestContext: RequestContext
  readonly abortSignal: AbortSignal
  readonly turnState: TurnState
  /**
   * `execute` — normal path; domain side-effects apply.
   * `dry-run` — runs validation + canDo but does not execute domain side-effects.
   * MVP always uses `execute`; the interface must accept both.
   */
  readonly mode: 'execute' | 'dry-run'
  /**
   * Optional. The user-intent slug for the current flow, used by FlowPolicyResolver
   * to merge flow-level approval policy with tool-level defaults.
   * Absent when the gateway is invoked outside a named intent flow.
   */
  readonly intentSlug?: IntentSlug
  /**
   * Optional. The flow ID for the current multi-turn flow. Passed through to
   * DraftProposer when a mutation tool is invoked successfully.
   */
  readonly flowId?: string
  /**
   * Runtime policy envelope for this turn. REQUIRED — callers must always be
   * explicit about the policy so there is no silent unrestricted fallback.
   *
   * When policy.readOnly === true, the gateway refuses any tool whose
   * descriptor.procedure === 'mutation' with variant 'policy_violation'.
   * Draft-creation (plan 08) is still allowed because drafts are proposals;
   * the actual write happens at approval time.
   *
   * Scheduled async turns pass READ_ONLY_POLICY here. Interactive turns pass
   * INTERACTIVE_POLICY (readOnly: false).
   */
  readonly policy: TurnPolicy
  /**
   * The raw user utterance that triggered this turn.
   * Forwarded to DraftProposer when a mutation tool succeeds, so the provenance
   * block is populated with the actual utterance (sanitized when approver ≠ initiator).
   * Optional — when absent, provenance.user_utterance is set to empty string.
   */
  readonly userUtterance?: string
  /**
   * Optional. The turn ID for idempotency dedup (D-5). When provided together with
   * toolCallId, write tool calls are deduplicated within a 24-hour TTL.
   */
  readonly turnId?: string
  /**
   * Optional. The LLM-assigned tool call ID for idempotency dedup (D-5).
   */
  readonly toolCallId?: string
}

/**
 * Public interface implemented by the production `ToolGateway` and the
 * `ReplayModeToolGateway` used by the golden-trace CI runner. Keeping a
 * narrow port lets us substitute implementations without leaking the
 * gateway's private orchestration internals.
 */
export interface ToolGatewayPort {
  invoke(input: ToolGatewayInvokeInput): Promise<ToolGatewayResult>
}

/**
 * DI token for `ToolGatewayPort`. Used by services that depend on the gateway
 * via the narrow port (TurnPipelineRunner; SubAgentRunnerAdapter).
 */
export const TOOL_GATEWAY = Symbol('TOOL_GATEWAY')
