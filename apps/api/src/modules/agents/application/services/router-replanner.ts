/**
 * Plan-shape-mismatch replanner — invoked when phase-1 output can't satisfy a
 * phase-2 input schema. Allowed at most ONCE per turn (routerReplanCount ≤ 1).
 *
 * This module exports pure helpers (canReplan, buildReplanContext) tested
 * independently. The full service class (RouterReplanner) wraps these with
 * LLM re-invocation and NestJS DI.
 *
 * Design principles:
 *   - Replanner sends a STRUCTURED DIFF (what was required vs. returned),
 *     not the full phase-1 output payloads, to keep cost predictable.
 *   - Replan fires at most once per turn.
 *   - On success: returns a new RouterPlan + increments routerReplanCount.
 *   - On failure: returns escalate → caller ends turn with disambiguation.
 */

import type { SubAgentOutput, PhaseShapeMismatch } from './phase-executor-contracts'

/**
 * Returns true iff a replan is permitted for this turn — at most one bounded
 * replan per turn.
 *
 * CONTRACT: the caller (RouterReplanner service) MUST set
 * `turnState.routerReplanCount = 1` after this returns true AND the replan
 * fires successfully. Failing to increment means the guard is permanently
 * bypassed for the turn.
 */
export function canReplan(routerReplanCount: 0 | 1): boolean {
  return routerReplanCount === 0
}

export interface ReplanContext {
  /** The structured diff: what phase-2 required vs. what phase-1 returned. */
  readonly mismatch: PhaseShapeMismatch
  /** Phase-1 output summaries keyed by sub-agent key. Summaries only — not full payloads. */
  readonly phase1Summaries: Record<string, string>
}

/**
 * Builds the structured context to send to the router for a replan.
 *
 * Sends summaries only (not full phase-1 outputs) to keep cost predictable.
 */
export function buildReplanContext(opts: {
  mismatch: PhaseShapeMismatch
  phase1Outputs: Map<string, SubAgentOutput>
}): ReplanContext {
  const { mismatch, phase1Outputs } = opts

  const phase1Summaries: Record<string, string> = {}
  for (const [key, output] of phase1Outputs) {
    phase1Summaries[key] = output.summary
  }

  return { mismatch, phase1Summaries }
}
