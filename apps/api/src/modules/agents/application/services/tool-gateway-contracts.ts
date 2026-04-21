/**
 * Pure type contracts for the ToolGateway pipeline runtime input.
 * No classes, no NestJS decorators, no side effects.
 * Per plan 01 §4 Interface Contracts.
 */

import type { L1Cache } from '../../infrastructure/cache/l1-cache'

// ─── RequestContext ────────────────────────────────────────────────────────────

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

// ─── TurnState ────────────────────────────────────────────────────────────────

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
   * Per-tool circuit-breaker state within this sub-agent turn.
   * Key: toolName. `brokenAt` is a Unix epoch ms timestamp.
   */
  readonly circuitBreaker: Map<
    string,
    {
      permissionDenied?: boolean
      ceilingBreached?: true
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
   * One instance per (turn, sub-agent) pair — created by the orchestrator (Task 5).
   */
  readonly l1Cache: L1Cache
}

// ─── ToolGatewayInvokeInput ───────────────────────────────────────────────────

/**
 * The full input shape for a single `ToolGateway.invoke()` call.
 * Per plan 01 §4 ToolGateway signature.
 */
export interface ToolGatewayInvokeInput {
  readonly toolName: string
  readonly args: unknown
  readonly subAgentKey: string
  readonly requestContext: RequestContext
  readonly abortSignal: AbortSignal
  readonly turnState: TurnState
  /**
   * `execute` — normal path; domain side-effects apply.
   * `dry-run` — runs validation + canDo but does not execute domain side-effects.
   * MVP always uses `execute`; the interface must accept both per R-01.7.
   */
  readonly mode: 'execute' | 'dry-run'
}
