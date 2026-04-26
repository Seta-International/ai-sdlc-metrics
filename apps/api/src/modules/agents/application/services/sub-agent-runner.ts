/**
 * SubAgentRunner — Plan 03 §4 "Sub-agent loop"
 *
 * Runs a single sub-agent through the ReAct loop (max 4-5 iterations) using
 * Vercel AI SDK's ToolLoopAgent, with:
 *   - outputSchema validation at exit (R-03.17)
 *   - Rule-based confidence derivation from trace signals (R-03.22)
 *   - DraftProposal taintSource provenance (R-03.32)
 *   - Ceiling-hit detection for the partial-answer gate (R-03.19)
 *
 * This module exports the pure helper functions (buildSubAgentOutput,
 * attachTaintSource) that are tested independently without the Vercel AI SDK.
 */

import type { ZodType } from 'zod'
import type {
  SubAgentOutput,
  DraftProposal,
  ConfidenceSignals,
  ToolCall,
  ToolName,
} from './phase-executor-contracts'
import { deriveConfidence } from './confidence-derivation'
import type { SubAgentUsage } from './phase-executor-contracts'

const ZERO_USAGE: SubAgentUsage = {
  inputTokens: 0,
  outputTokens: 0,
  inputCachedRead: 0,
  inputCachedWrite: 0,
  outputReasoning: 0,
  costUsd: 0,
}

// ─── attachTaintSource ────────────────────────────────────────────────────────

/**
 * Attaches taintSource provenance to a DraftProposal when the turn is tainted
 * (R-03.32). Returns the draft unchanged if the turn is not tainted.
 *
 * `taintSource` tells plan 08 WHY the draft requires a higher approval tier:
 * a specific tool call returned tenant-authored free text that entered the
 * LLM context before this draft was produced.
 */
export function attachTaintSource(
  draft: DraftProposal,
  taintInfo: {
    isTainted: boolean
    subAgentKey: string
    toolName: ToolName
    fieldName: string
    flippedAtIteration: number
  },
): DraftProposal {
  if (!taintInfo.isTainted) {
    return draft
  }

  return {
    ...draft,
    taintSource: {
      subAgentKey: taintInfo.subAgentKey,
      toolName: taintInfo.toolName,
      fieldName: taintInfo.fieldName,
      flippedAtIteration: taintInfo.flippedAtIteration,
    },
  }
}

// ─── buildSubAgentOutput ──────────────────────────────────────────────────────

export interface BuildSubAgentOutputOpts {
  /** Raw structured data from the sub-agent's last iteration. */
  readonly rawStructured: unknown
  /** The sub-agent's declared output schema (from ValidatedSubAgentConfig). */
  readonly outputSchema: ZodType
  /** Trace signals collected during the ReAct loop. */
  readonly signals: ConfidenceSignals
  readonly summary: string
  readonly semantics: string
  readonly sourceToolProvenance: ToolCall[]
  readonly circuitBreakerState: Record<ToolName, { disabled: boolean; reason: string }>
  readonly drafts?: DraftProposal[]
  /**
   * Actual token/cost usage from the Vercel AI SDK for this sub-agent's loop.
   * Pass the SDK-reported values when available; defaults to ZERO_USAGE when
   * the full ReAct loop integration is not yet wired up.
   */
  readonly usageTotals?: SubAgentUsage
}

/**
 * Constructs a SubAgentOutput from the trace signals and raw data produced by
 * the ReAct loop.
 *
 * R-03.17: `structured` is validated against `config.outputSchema` at exit.
 *          A mismatch → kind='errored' (never throws).
 *
 * R-03.22: confidence is derived from `signals` via `deriveConfidence()`.
 *
 * Ceiling-hit precedence: if `signals.ceilingHit` is true, `kind` is forced
 * to 'ceiling_hit' regardless of schema validity.
 */
export function buildSubAgentOutput(opts: BuildSubAgentOutputOpts): SubAgentOutput {
  const {
    rawStructured,
    outputSchema,
    signals,
    summary,
    semantics,
    sourceToolProvenance,
    circuitBreakerState,
    drafts,
    usageTotals = ZERO_USAGE,
  } = opts

  const confidence = deriveConfidence(signals)

  // Ceiling hit takes precedence over completion/error status
  if (signals.ceilingHit) {
    const parsed = outputSchema.safeParse(rawStructured)
    return {
      kind: 'ceiling_hit',
      summary,
      semantics,
      confidence,
      sourceToolProvenance,
      structured: parsed.success ? parsed.data : rawStructured,
      drafts,
      circuitBreakerState,
      usageTotals,
    }
  }

  // Validate structured output against the declared schema (R-03.17)
  const parsed = outputSchema.safeParse(rawStructured)
  if (!parsed.success) {
    return {
      kind: 'errored',
      summary,
      semantics,
      confidence,
      sourceToolProvenance,
      structured: rawStructured,
      drafts,
      circuitBreakerState,
      usageTotals,
    }
  }

  return {
    kind: 'completed',
    summary,
    semantics,
    confidence,
    sourceToolProvenance,
    structured: parsed.data,
    drafts,
    circuitBreakerState,
    usageTotals,
  }
}
