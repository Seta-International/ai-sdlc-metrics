/**
 * react-loop-driver — Plan 17 PR 2 Task 5.
 *
 * Pure ReAct driver that wraps `SubAgentLlmClient.runWithTools` (Task 3) and
 * translates the result + `BridgeAccumulator` (Task 4) state into a typed
 * `ReactLoopDriverResult`.
 *
 * Termination dispatch:
 *   - Normal return                → result with `aborted: false`,
 *                                    `signals.ceilingHit = (finishReason === 'tool-calls')`.
 *   - `HardTripwireError` thrown   → result carries `hardTripwire` and ZERO_USAGE.
 *   - `AbortError` (or aborted)    → result with `aborted: true` and ZERO_USAGE.
 *   - Any other thrown error       → re-thrown to the caller (no swallowing).
 *
 * Zero NestJS, zero Drizzle, zero AI SDK. Task 6 (sub-agent-runner-adapter)
 * is the only consumer.
 */

import type { ZodType } from 'zod'
import {
  HardTripwireError,
  type BridgeAccumulator,
} from '../../infrastructure/tool-gateway/tool-gateway-bridge'
import type {
  SubAgentLlmClient,
  SubAgentLlmClientResult,
} from '../../infrastructure/llm/sub-agent-llm-client'
import type { Tripwire } from '../../infrastructure/guards/tripwire'
import type { ModelChoice } from '../../domain/services/sub-agent-types'
import type { ConfidenceSignals, SubAgentUsage, ToolName } from './phase-executor-contracts'

// ─── ZERO_USAGE ───────────────────────────────────────────────────────────────

/** Canonical zero-usage record (mirrors `sub-agent-runner.ts`). */
const ZERO_USAGE: SubAgentUsage = {
  inputTokens: 0,
  outputTokens: 0,
  inputCachedRead: 0,
  inputCachedWrite: 0,
  outputReasoning: 0,
  costUsd: 0,
}

// ─── Driver opts + result ─────────────────────────────────────────────────────

export interface ReactLoopDriverOpts {
  readonly llmClient: SubAgentLlmClient
  readonly model: ModelChoice
  readonly system: string
  readonly userMessage: string
  /**
   * The Vercel AI SDK tool record built by `buildSubAgentTools` (Task 4).
   * Typed as `Record<ToolName, unknown>` here to keep this driver decoupled
   * from the AI SDK's internal `ToolSet` typing; the load-bearing cast at the
   * call site below bridges it back to what `SubAgentLlmClient` expects.
   */
  readonly tools: Record<ToolName, unknown>
  readonly outputSchema: ZodType
  readonly maxIterations: number
  readonly abortSignal: AbortSignal
  readonly accumulator: BridgeAccumulator
}

export interface ReactLoopDriverResult {
  readonly rawStructured: unknown
  readonly text: string
  readonly signals: ConfidenceSignals
  readonly usageTotals: SubAgentUsage
  readonly hardTripwire?: { tripwire: Tripwire; toolName: ToolName }
  readonly aborted: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Maps `BridgeAccumulator` fields directly onto the `ConfidenceSignals` shape.
 * `accumulator.callCount` is intentionally NOT a signal — the contract is
 * fixed at the seven listed fields.
 */
function buildSignals(acc: BridgeAccumulator, ceilingHit: boolean): ConfidenceSignals {
  return {
    toolResultCount: acc.toolResultCount,
    retryCount: acc.retryCount,
    toolFailureCount: acc.toolFailureCount,
    taintFlippedDuringRun: acc.taintFlippedDuringRun,
    ceilingHit,
    semanticConflictWithSibling: acc.semanticConflictWithSibling,
    circuitBreakerEventOccurred: acc.circuitBreakerEventOccurred,
  }
}

function isAbortError(err: unknown, signal: AbortSignal): boolean {
  if (signal.aborted) return true
  if (typeof err !== 'object' || err === null) return false
  const name = (err as { name?: unknown }).name
  return name === 'AbortError'
}

// ─── runReactLoop ─────────────────────────────────────────────────────────────

export async function runReactLoop(opts: ReactLoopDriverOpts): Promise<ReactLoopDriverResult> {
  let result: SubAgentLlmClientResult
  try {
    result = await opts.llmClient.runWithTools({
      model: opts.model,
      system: opts.system,
      userMessage: opts.userMessage,
      // Load-bearing cast: the driver intentionally types `tools` as
      // `Record<ToolName, unknown>` to avoid leaking AI SDK internals; the
      // SubAgentLlmClient signature accepts a more specific record. The
      // narrower type is statically guaranteed by `buildSubAgentTools` (Task 4).
      tools: opts.tools as Record<string, never>,
      outputSchema: opts.outputSchema,
      maxIterations: opts.maxIterations,
      abortSignal: opts.abortSignal,
    })
  } catch (caught) {
    if (caught instanceof HardTripwireError) {
      return {
        rawStructured: {},
        text: '',
        signals: buildSignals(opts.accumulator, false),
        usageTotals: ZERO_USAGE,
        hardTripwire: { tripwire: caught.tripwire, toolName: caught.toolName },
        aborted: false,
      }
    }
    if (isAbortError(caught, opts.abortSignal)) {
      return {
        rawStructured: {},
        text: '',
        signals: buildSignals(opts.accumulator, false),
        usageTotals: ZERO_USAGE,
        aborted: true,
      }
    }
    throw caught
  }

  const ceilingHit = result.finishReason === 'tool-calls'
  return {
    rawStructured: result.rawStructured,
    text: result.text,
    signals: buildSignals(opts.accumulator, ceilingHit),
    usageTotals: result.usage,
    aborted: false,
  }
}
