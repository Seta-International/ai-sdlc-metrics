/**
 * Type contracts for phase executor, sub-agent runner, and synthesizer.
 *
 * Pure TypeScript. Zero NestJS / Drizzle / Zod dependencies.
 */

import type { BoundedPlan, SubAgentDirective } from '../../domain/value-objects/router-plan-schema'
import type { ValidatedSubAgentConfig } from '../../domain/services/sub-agent-types'
import type { ScorerResult } from '../../domain/scorer-types'
import type { StreamEmitter } from './stream-gateway'

export type Confidence = 'high' | 'med' | 'low'

export type AnswerShape = 'short-answer' | 'list' | 'table' | 'narrative' | 'chart'

export type CancellationReason =
  | 'user'
  | 'timeout'
  | 'budget'
  | 'provider_outage'
  | 'quality_canary'

export type ToolName = string
export type SubAgentKey = string

/** A single recorded tool invocation within a sub-agent's ReAct loop. */
export interface ToolCall {
  readonly toolName: ToolName
  readonly args: unknown
  readonly result: unknown
  /**
   * 1-indexed monotonic counter shared across all tool calls within a single
   * sub-agent ReAct loop. Matches `DraftProposal.taintSource.flippedAtIteration`
   * so taint provenance and call provenance use the same coordinate.
   */
  readonly iteration: number
  readonly durationMs: number
}

/**
 * A write proposal produced by a sub-agent during its ReAct loop.
 * The full shape is shared with plan 08 (drafts module); the phase-executor
 * contributes taintSource provenance.
 */
export interface DraftProposal {
  readonly id: string
  readonly toolName: ToolName
  readonly args: unknown
  /**
   * Taint provenance — populated by SubAgentRunner when the draft is produced
   * under a tainted turn state.
   * Consumed for approval-tier bump rationale + UI presentation.
   */
  readonly taintSource?: {
    readonly subAgentKey: SubAgentKey
    readonly toolName: ToolName
    readonly fieldName: string
    readonly flippedAtIteration: number
  }
}

/**
 * A citation in the synthesizer output.
 * `subAgentKey` is mandatory — the synthesizer MUST NOT merge citations from
 * different sub-agents into a single record that loses per-key attribution.
 */
export interface Citation {
  /** The prose claim this citation supports (paragraph or sentence level). */
  readonly claim: string
  /** The tool invocation(s) in the sub-agent's chain that produced this claim. */
  readonly sources: ToolCall[]
  /** Which sub-agent's chain produced this claim. Mandatory. */
  readonly subAgentKey: SubAgentKey
}

export interface SubAgentUsage {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly inputCachedRead: number
  readonly inputCachedWrite: number
  readonly outputReasoning: number
  readonly costUsd: number
}

/**
 * Output produced by SubAgentRunner.run() after the ReAct loop completes
 * or terminates.
 *
 * `kind` encodes the termination reason:
 *   - `completed`         — loop finished normally; all structured data is valid.
 *   - `ceiling_hit`       — wallclock / iteration / cost ceiling exceeded mid-loop.
 *   - `all_tools_disabled`— circuit breaker disabled all tools; sub-agent has no data source.
 *   - `errored`           — structured output failed schema validation, or unexpected error.
 *   - `aborted`           — AbortSignal fired; `abortReason` is populated.
 */
export interface SubAgentOutput {
  readonly kind: 'completed' | 'ceiling_hit' | 'all_tools_disabled' | 'errored' | 'aborted'
  /** Populated iff kind === 'aborted'. */
  readonly abortReason?: CancellationReason
  /** Human-readable summary of what the sub-agent found. */
  readonly summary: string
  /** What was measured / the semantic frame of the summary (e.g. "has logged hours this month"). */
  readonly semantics: string
  /** Rule-derived confidence (NOT LLM self-assessed). */
  readonly confidence: Confidence
  /** Tool calls that produced the structured output. Used for citations. */
  readonly sourceToolProvenance: ToolCall[]
  /** Validated against config.outputSchema at sub-agent exit. `unknown` until validated. */
  readonly structured: unknown
  /** Write proposals produced during the sub-agent's ReAct loop. */
  readonly drafts?: DraftProposal[]
  /** Per-tool circuit-breaker state at the end of this sub-agent's run. */
  readonly circuitBreakerState: Record<ToolName, { disabled: boolean; reason: string }>
  readonly usageTotals: SubAgentUsage
}

/**
 * Output produced by Synthesizer.synthesize().
 *
 * `turnEndedReason` includes `'errored'` so the post-shape stream-failure
 * fallback path can return a structurally valid result without raising.
 * `usage` is populated when the LLM stream resolves successfully; it is
 * `undefined` on the deterministic fallback path.
 */
export interface SynthesizerOutput {
  readonly shape: AnswerShape
  /** Shape-specific content: string | Array | TableData | ChartData | Narrative */
  readonly content: unknown
  readonly citations: Citation[]
  /** MIN across contributing sub-agents + one-step demotion on contradiction. */
  readonly confidence: Confidence
  readonly turnEndedReason: 'completed' | 'partial' | 'errored'
  /** Token usage from the LLM stream. Undefined on the deterministic fallback path. */
  readonly usage?: SubAgentUsage
}

/**
 * Result returned by PhaseExecutor.execute().
 */
export type PhaseExecutionResult =
  | { kind: 'synthesized'; answer: SynthesizerOutput; drafts: DraftProposal[] }
  | { kind: 'disambiguation'; question: string }
  | { kind: 'partial'; answer: SynthesizerOutput; reason: 'limit_reached' }
  | { kind: 'aborted'; reason: CancellationReason }

/**
 * Observable trace signals collected during a sub-agent's ReAct loop.
 * Used by `deriveConfidence()` to compute per-sub-agent confidence
 * without relying on LLM self-assessment.
 */
export interface ConfidenceSignals {
  /** Number of distinct tool results that corroborate the answer (≥1 = corroborated). */
  readonly toolResultCount: number
  /** Number of retry events (LLM retries or tool retries) during the loop. */
  readonly retryCount: number
  /** Number of tool failures (error responses, not circuit-breaker). */
  readonly toolFailureCount: number
  /** Whether the turn's taint flag was flipped during THIS sub-agent's iterations. */
  readonly taintFlippedDuringRun: boolean
  /** Whether the sub-agent hit a ceiling (wallclock / iteration / cost). */
  readonly ceilingHit: boolean
  /** Whether the sub-agent's declared semantics conflict with a sibling's semantics. */
  readonly semanticConflictWithSibling: boolean
  /** Whether any circuit-breaker events occurred during this sub-agent's run. */
  readonly circuitBreakerEventOccurred: boolean
}

export type PartialAnswerDecision =
  | 'surface_partial' // ceiling hit + zero writes → surface partial
  | 'suppress_partial' // ceiling hit + writes drafted → suppress, drafts only
  | 'no_ceiling' // no sub-agent hit a ceiling; full synthesis proceeds

/**
 * Exit criteria for the iterative supervisor loop.
 * Pure TypeScript mirror of the Zod CompletionSpecSchema in router-plan-schema.
 */
export type CompletionSpec = {
  readonly scorerIds: string[]
  readonly strategy: 'all' | 'any'
  readonly maxIterations: number
  readonly hintToRouter: string
}

/**
 * Immutable record of a single completed iteration in the supervisor loop.
 * Appended to `PhaseExecutorTurnState.iterationHistory` after each iteration.
 */
export type IterationRecord = {
  readonly iterationNumber: number
  readonly subAgentKey: string
  readonly directive: SubAgentDirective
  readonly output: SubAgentOutput
  readonly scorerResults: ScorerResult[]
  readonly isComplete: boolean
}

/**
 * Extended turn state for the phase executor.
 * Lives in the request handler and is threaded through all phase-executor components.
 */
export interface PhaseExecutorTurnState {
  readonly traceId: string
  readonly tenantId: string
  readonly userId: string
  readonly conversationId: string
  readonly sessionId: string
  readonly surface: 'global-chat' | 'inline' | 'async'
  /** Shared mutable taint flag — any sub-agent can flip it to true. */
  readonly tainted: { value: boolean }
  readonly executionMode: 'default' | 'bypass'
  routerReplanCount: 0 | 1
  /** Current 1-based iteration number (mutable). Undefined for non-iterative topologies. */
  iterationNumber?: number
  /** Exit criteria for the supervisor loop. Undefined for non-iterative topologies. */
  completionCriteria?: CompletionSpec
  /** Ordered history of completed iterations. Undefined for non-iterative topologies. */
  iterationHistory?: IterationRecord[]
  /** Cumulative LLM cost in USD across all iterations so far (mutable). */
  cumulativeCostUsd?: number
  /** Cumulative wall-clock time in milliseconds across all iterations so far (mutable). */
  cumulativeWallclockMs?: number
  /**
   * Runtime context note appended to the user message of phase-2 sub-agents.
   * Set by BoundedExecutor before phase-2 dispatch.
   * Read by SubAgentRunnerAdapter when constructing the sub-agent user message.
   * Undefined for phase-1 dispatch (or when no circuit-breaker context exists).
   *
   * Optional + mutable to match the `routerReplanCount`/`iterationNumber` style
   * used elsewhere in this interface.
   */
  phaseContextNote?: string
}

export interface SubAgentRunnerOpts {
  readonly directive: SubAgentDirective
  readonly config: ValidatedSubAgentConfig
  readonly phase: 1 | 2
  /** Only provided to phase-2 sub-agents; undefined for phase-1. */
  readonly phase1SanitizedInput?: Record<string, unknown>
  readonly abortSignal: AbortSignal
  readonly turnState: PhaseExecutorTurnState
}

/**
 * The artificial phase1/phase2 split is collapsed into a single `outputs` map.
 * The synthesizer no longer cares whether a given output came from phase 1 or
 * phase 2; iterative orchestration already produced one keyed map per iteration,
 * and bounded execution can flatten its two phases the same way at the call
 * site. `streamEmitter` is required so the adapter can emit per-shape
 * `answer.token` events as the LLM streams.
 */
export interface SynthesizerOpts {
  readonly directive: BoundedPlan
  readonly outputs: ReadonlyMap<SubAgentKey, SubAgentOutput>
  readonly userUtterance: string
  readonly abortSignal: AbortSignal
  readonly turnState: PhaseExecutorTurnState
  readonly streamEmitter: StreamEmitter
}

export interface PhaseShapeMismatch {
  readonly phase2Required: string[]
  readonly phase1Missing: string[]
}
