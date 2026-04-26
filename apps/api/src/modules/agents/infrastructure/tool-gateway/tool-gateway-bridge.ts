/**
 * tool-gateway-bridge — Plan 17 PR 2 Task 4.
 *
 * Bridges `ToolGateway.invoke()` results onto Vercel AI SDK `tool({})`
 * semantics:
 *   - Hard tripwires (disposition === 'abort') throw `HardTripwireError` so the
 *     ReAct loop driver (Task 5) can short-circuit.
 *   - Soft tripwires (disposition === 'retry') return `{ error, message }` to
 *     the LLM so it can reason about the failure and retry on its own terms.
 *   - Successes return the gateway's `result` payload directly.
 *
 * Side-effects of each invocation are accumulated into a `BridgeAccumulator`
 * that the runner adapter (Task 6) consumes to build `SubAgentOutput` —
 * specifically `sourceToolProvenance`, `drafts`, and the rule-based confidence
 * signals (toolResultCount, toolFailureCount, taintFlippedDuringRun, ceilingHit).
 *
 * Field translations vs. earlier plan drafts:
 *   - `okResult.value`           → `ToolGatewayOk.result`
 *   - `okResult.drafts[]`        → `ToolGatewayOk.draft?` (singular, optional)
 *   - `okResult.taintFlipped`    → derived from `turnState.tainted.value`
 *                                   transition observed across the call
 *   - `tripwire.tripwireKind`    → `Tripwire.variant`
 *   - `tripwire.action`          → `Tripwire.disposition`
 *   - `tripwire.message`         → `Tripwire.context['message']`
 */

import { tool } from 'ai'
import type {
  ToolGatewayPort,
  ToolGatewayInvokeInput,
} from '../../application/services/tool-gateway-contracts'
import type {
  DraftProposal,
  ToolCall,
  ToolName,
} from '../../application/services/phase-executor-contracts'
import { tripwire as buildTripwire } from '../guards/tripwire'
import type { Tripwire, ToolGatewayResult } from '../guards/tripwire'
import type { ToolRegistry } from '../tool-registry/tool-registry'
import type { AiSdkTool } from '../llm/sub-agent-llm-client'
import { recordSubAgentToolFailure } from '../observability/sub-agent-metrics'

// ─── Accumulator ──────────────────────────────────────────────────────────────

/**
 * Mutable bag accumulated across every gateway-bridged tool call within a
 * single sub-agent's ReAct loop. The runner adapter (Task 6) reads this when
 * the loop terminates to construct `SubAgentOutput` and the
 * `ConfidenceSignals` consumed by `deriveConfidence`.
 *
 * Fields that the bridge cannot derive from a single gateway call
 * (`semanticConflictWithSibling`, `circuitBreakerEventOccurred`,
 * `circuitBreakerState`) are initialised to safe defaults and populated
 * externally by the runner adapter.
 */
export interface BridgeAccumulator {
  /**
   * Count of successful tool invocations (`kind: 'ok'` returned by the
   * gateway). Soft and hard tripwires are tracked in `toolFailureCount` /
   * thrown `HardTripwireError` respectively — they never increment this.
   */
  toolResultCount: number
  toolFailureCount: number
  /**
   * 1-indexed monotonic counter of tool invocations within this bridge build
   * (i.e. one sub-agent ReAct loop). Shared across every tool wired by this
   * `buildSubAgentTools()` call so that `ToolCall.iteration` and
   * `DraftProposal.taintSource.flippedAtIteration` use the same coordinate.
   * Incremented at the entry of each `execute()` regardless of outcome.
   */
  callCount: number
  /**
   * Counter that tracks the number of soft (retry-disposition) tripwires
   * surfaced to the LLM during this run. Distinct from `toolFailureCount`
   * because confidence signals will eventually distinguish "LLM-visible
   * retry hint" from raw failures; for MVP they are incremented in lockstep
   * via `toolFailureCount`. Kept here as a separate scalar so Task 6 can
   * thread it into `ConfidenceSignals.retryCount` without re-deriving it.
   */
  retryCount: number
  taintFlippedDuringRun: boolean
  ceilingHit: boolean
  /** Set externally by Task 6 after sibling outputs have been compared. */
  semanticConflictWithSibling: boolean
  /** Set externally by Task 6 from `turnState.circuitBreaker` deltas. */
  circuitBreakerEventOccurred: boolean
  sourceToolProvenance: ToolCall[]
  drafts: DraftProposal[]
  /** Populated externally by Task 6 from the final `turnState.circuitBreaker`. */
  circuitBreakerState: Record<ToolName, { disabled: boolean; reason: string }>
}

export function newAccumulator(): BridgeAccumulator {
  return {
    toolResultCount: 0,
    toolFailureCount: 0,
    callCount: 0,
    retryCount: 0,
    taintFlippedDuringRun: false,
    ceilingHit: false,
    semanticConflictWithSibling: false,
    circuitBreakerEventOccurred: false,
    sourceToolProvenance: [],
    drafts: [],
    circuitBreakerState: {},
  }
}

// ─── HardTripwireError ────────────────────────────────────────────────────────

/**
 * Thrown by `execute()` when the gateway returns a tripwire with
 * `disposition === 'abort'`. The ReAct loop driver catches this and ends the
 * sub-agent without surfacing the error to the LLM.
 */
export class HardTripwireError extends Error {
  constructor(
    public readonly tripwire: Tripwire,
    public readonly toolName: ToolName,
  ) {
    super(`Hard tripwire '${tripwire.variant}' from tool '${toolName}'`)
    this.name = 'HardTripwireError'
  }
}

// ─── Classifier ───────────────────────────────────────────────────────────────

/**
 * Hard = abort. Soft = retry. There are exactly two dispositions
 * (`TripwireDisposition`); `disposition === 'abort'` is sufficient.
 *
 * Note: `infra_error` lives in `FIXED_ABORT_VARIANTS`, so its disposition is
 * always `'abort'`. The plan-level OR with `variant === 'infra_error'` is
 * therefore redundant — implemented here as the plain disposition check.
 */
export function isHardTripwire(result: ToolGatewayResult): boolean {
  return result.kind === 'tripwire' && result.disposition === 'abort'
}

// ─── buildSubAgentTools ───────────────────────────────────────────────────────

export interface BuildSubAgentToolsOpts {
  readonly toolScope: ReadonlyArray<ToolName>
  readonly registry: Pick<ToolRegistry, 'getDescriptor'>
  readonly toolGateway: ToolGatewayPort
  readonly invokeContext: Omit<ToolGatewayInvokeInput, 'toolName' | 'args'>
  readonly accumulator: BridgeAccumulator
}

const CEILING_VARIANTS: ReadonlySet<Tripwire['variant']> = new Set<Tripwire['variant']>([
  'ceiling_breach_bytes',
  'ceiling_breach_wallclock',
])

/**
 * For each tool name in `toolScope`, look up the descriptor in `registry` and
 * return a Vercel AI SDK `tool({...})` whose `execute()` invokes the gateway
 * via `toolGateway.invoke({...})` and translates the result onto AI SDK
 * semantics. Tools missing from the registry are skipped silently.
 */
export function buildSubAgentTools(opts: BuildSubAgentToolsOpts): Record<ToolName, AiSdkTool> {
  const { toolScope, registry, toolGateway, invokeContext, accumulator } = opts
  const tools: Record<ToolName, AiSdkTool> = {}

  for (const toolName of toolScope) {
    const descriptor = registry.getDescriptor(toolName)
    if (!descriptor) continue

    const wrapped = tool({
      description: descriptor.meta.whenToUse,
      inputSchema: descriptor.inputSchema as never,
      execute: async (args: unknown) => {
        accumulator.callCount += 1
        const iteration = accumulator.callCount
        const startMs = Date.now()
        const wasTainted = invokeContext.turnState.tainted.value

        let result: ToolGatewayResult
        try {
          result = await toolGateway.invoke({
            ...invokeContext,
            toolName,
            args,
          })
        } catch (caught) {
          // I-2: a thrown gateway error must surface as a HardTripwireError so the
          // ReAct loop's hard-abort path can short-circuit. Pre-existing
          // HardTripwireErrors (e.g. nested gateway plumbing) are rethrown as-is
          // to preserve their identity and original tripwire context.
          if (caught instanceof HardTripwireError) throw caught
          const err = caught as { message?: unknown; name?: unknown }
          const message = typeof err.message === 'string' ? err.message : 'gateway threw'
          const cause = typeof err.name === 'string' ? err.name : 'Error'
          const synthetic = buildTripwire('infra_error', 'abort', { message, cause })
          throw new HardTripwireError(synthetic, toolName)
        }

        if (result.kind === 'ok') {
          accumulator.toolResultCount += 1
          accumulator.sourceToolProvenance.push({
            toolName,
            args,
            result: result.result,
            iteration,
            durationMs: Date.now() - startMs,
          })

          if (result.draft) {
            accumulator.drafts.push({
              id: result.draft.draftId,
              toolName,
              args,
            })
          }

          if (!wasTainted && invokeContext.turnState.tainted.value) {
            accumulator.taintFlippedDuringRun = true
          }

          return result.result
        }

        // Tripwire path
        if (isHardTripwire(result)) {
          throw new HardTripwireError(result, toolName)
        }

        // Soft (retry) tripwire — surface to LLM as a recoverable error.
        accumulator.toolFailureCount += 1
        accumulator.retryCount += 1
        if (CEILING_VARIANTS.has(result.variant)) {
          accumulator.ceilingHit = true
        }
        recordSubAgentToolFailure({
          subAgentKey: invokeContext.subAgentKey,
          toolName,
          tripwireKind: result.variant,
          severity: 'soft',
        })

        const message = result.context['message']
        return {
          error: result.variant,
          message: typeof message === 'string' ? message : '',
        }
      },
    })

    tools[toolName] = wrapped as AiSdkTool
  }

  return tools
}
