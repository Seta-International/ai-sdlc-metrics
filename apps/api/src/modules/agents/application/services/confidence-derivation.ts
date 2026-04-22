/**
 * Confidence derivation — Plan 03 §5 "Confidence derivation (rule-based)".
 *
 * Pure functions. Zero side-effects. No LLM calls.
 *
 * R-03.22: Confidence is rule-derived from observable trace signals, NOT from
 * LLM self-assessment. LLM-reported confidence is noisy and under-reports on
 * wrong answers.
 */

import type { Confidence, ConfidenceSignals } from './phase-executor-contracts'

/**
 * Derive per-sub-agent confidence from observable trace signals.
 *
 * Rule table (evaluated in order — low rules take precedence):
 *
 * LOW iff any of:
 *   - taint flipped during the sub-agent's run (tenant-authored free text entered LLM context)
 *   - ceiling hit (wallclock / iteration / cost budget exceeded)
 *   - declared semantics conflict with a sibling sub-agent's output
 *
 * MED iff any of (and no LOW condition applies):
 *   - toolResultCount === 0 (no corroboration — single partial or no result)
 *   - retryCount > 0 (LLM or tool retries occurred)
 *   - toolFailureCount > 0 (tool errors occurred)
 *   - circuitBreakerEventOccurred (circuit breaker tripped for at least one tool)
 *
 * HIGH iff (none of the above applies):
 *   - toolResultCount ≥ 1 (answer corroborated by at least one tool result)
 *   - retryCount === 0
 *   - toolFailureCount === 0
 *   - no taint, no ceiling, no conflict
 */
export function deriveConfidence(signals: ConfidenceSignals): Confidence {
  // LOW — highest precedence
  if (signals.taintFlippedDuringRun || signals.ceilingHit || signals.semanticConflictWithSibling) {
    return 'low'
  }

  // MED
  if (
    signals.toolResultCount === 0 ||
    signals.retryCount > 0 ||
    signals.toolFailureCount > 0 ||
    signals.circuitBreakerEventOccurred
  ) {
    return 'med'
  }

  // HIGH
  return 'high'
}

/**
 * Compute final synthesizer confidence across all contributing sub-agents.
 *
 * Algorithm (R-03.22):
 *   1. Take MIN of all per-sub-agent confidences.
 *   2. Apply one-step demotion if contradiction detected:
 *      high → med, med → low, low → low (floor).
 *
 * Empty outputs → 'low' (conservative).
 */
export function computeFinalConfidence(
  subAgentConfidences: Confidence[],
  contradictionDetected: boolean,
): Confidence {
  if (subAgentConfidences.length === 0) {
    return 'low'
  }

  const min = minConfidence(subAgentConfidences)

  if (!contradictionDetected) {
    return min
  }

  return demoteConfidence(min)
}

// ─── Private helpers ──────────────────────────────────────────────────────────

const CONFIDENCE_ORDER: Record<Confidence, number> = { low: 0, med: 1, high: 2 }

function minConfidence(confidences: Confidence[]): Confidence {
  return confidences.reduce((acc, c) => (CONFIDENCE_ORDER[c] < CONFIDENCE_ORDER[acc] ? c : acc))
}

function demoteConfidence(c: Confidence): Confidence {
  if (c === 'high') return 'med'
  if (c === 'med') return 'low'
  return 'low' // already at floor
}
