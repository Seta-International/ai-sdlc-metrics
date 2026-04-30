/**
 * Pure utility functions used by the phase executor:
 *   - validatePlanEntry()         — plan shape validation at executor entry
 *   - evaluatePartialAnswerGate() — ceiling-hit + writes logic
 *   - buildCircuitBreakerContextNote() — context for phase-2 directives
 *
 * Topology semantics:
 *   Tier 0 (direct): single tool call, no sub-agents, no synthesizer.
 *   Tier 1 (bounded): phase-1 fan-out → optional phase-2 fan-out → synthesizer.
 *   Tier 2 (iterative): dispatched to the iterative supervisor.
 */

import type {
  RouterPlan,
  BoundedPlan,
  DirectExecutionPlan,
} from '../../domain/value-objects/router-plan-schema'
import type { SubAgentOutput, PartialAnswerDecision } from './phase-executor-contracts'

/**
 * Validates the RouterPlan shape at phase-executor entry.
 *
 * Checks enforced here (in addition to the Zod-schema checks already applied
 * by the router parser):
 *   - topology must be one of 'direct' | 'bounded' | 'iterative'
 *   - bounded: phase1.length ∈ [0..3] — re-validates the schema max
 *   - bounded: phase2.length ∈ [0..3] — re-validated at executor entry
 *
 * Throws on any violation so the caller can escalate to disambiguation.
 */
export function validatePlanEntry(plan: RouterPlan): void {
  const validTopologies = ['direct', 'bounded', 'iterative'] as const
  if (!validTopologies.includes(plan.topology as (typeof validTopologies)[number])) {
    throw new Error(
      `Unknown topology "${plan.topology}" at phase-executor entry. ` +
        `Valid topologies: ${validTopologies.join(', ')}.`,
    )
  }

  if (plan.topology === 'bounded') {
    const bounded = plan as BoundedPlan
    if (bounded.phase1.length > 3) {
      throw new Error(
        `phase1 length ${bounded.phase1.length} exceeds max 3 at phase-executor entry. ` +
          `phase1.length ∈ [1..3].`,
      )
    }
    if (bounded.phase2.length > 3) {
      throw new Error(
        `phase2 length ${bounded.phase2.length} exceeds max 3 at phase-executor entry. ` +
          `phase2.length ∈ [0..3].`,
      )
    }
  }

  if (plan.topology === 'direct') {
    const direct = plan as DirectExecutionPlan
    if (!direct.toolName || direct.toolName.trim() === '') {
      throw new Error('Direct execution plan must have a non-empty toolName.')
    }
  }
}

/**
 * Evaluates the partial-answer gate after all phase-1 (and optionally phase-2)
 * sub-agents complete.
 *
 * Rules:
 *   - If no sub-agent hit a ceiling → 'no_ceiling' (full synthesis proceeds)
 *   - If any sub-agent hit a ceiling AND any sub-agent (any phase) has drafts →
 *     'suppress_partial' (writes-only guard: surface drafts, suppress partial answer)
 *   - If any sub-agent hit a ceiling AND zero writes drafted across all sub-agents →
 *     'surface_partial' (partial answer labeled "partial — limit reached")
 */
export function evaluatePartialAnswerGate(
  outputs: Map<string, SubAgentOutput>,
): PartialAnswerDecision {
  let anyCeilingHit = false
  let anyDraftProduced = false

  for (const output of outputs.values()) {
    if (output.kind === 'ceiling_hit') {
      anyCeilingHit = true
    }
    if (output.drafts && output.drafts.length > 0) {
      anyDraftProduced = true
    }
  }

  if (!anyCeilingHit) {
    return 'no_ceiling'
  }

  return anyDraftProduced ? 'suppress_partial' : 'surface_partial'
}

/**
 * Builds a context note about disabled tools to include in a phase-2 directive.
 * This propagates circuit-breaker state from phase-1 sub-agents to phase-2
 * sub-agents as informational context.
 *
 * Returns an empty string if no tools are disabled.
 */
export function buildCircuitBreakerContextNote(
  circuitBreakerState: Record<string, { disabled: boolean; reason: string }>,
): string {
  const disabled = Object.entries(circuitBreakerState)
    .filter(([, state]) => state.disabled)
    .map(([tool]) => tool)

  if (disabled.length === 0) {
    return ''
  }

  const toolList = disabled.map((t) => `"${t}"`).join(', ')
  return `Note: the following tool(s) are unavailable this turn due to prior failures: ${toolList}.`
}
