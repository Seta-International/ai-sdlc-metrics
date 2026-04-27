/**
 * Synthesizer — Plan 03 §9
 *
 * Merges structured outputs from all phase-1 and phase-2 sub-agents into
 * a single typed answer with citations and rule-derived confidence.
 *
 * Key principles (R-03.21..R-03.29):
 *   - Input is structured multi-source (summary + semantics + confidence + provenance per source)
 *   - Confidence is rule-derived; never LLM self-assessed
 *   - Contradictions are rendered as definitional clarity (not "disagreement" framing)
 *   - Citations carry per-sub-agent attribution; keys are never merged (R-03.33)
 *   - Failed sub-agents (all_tools_disabled, errored) are explicitly disclosed (R-03.31)
 *
 * This module exports the pure synthesis logic functions that are tested independently.
 * The full Synthesizer service (with LLM calls and NestJS DI) wraps these in plan 03 later.
 */

import type { SubAgentOutput, Citation } from './phase-executor-contracts'

// ─── detectContradiction ──────────────────────────────────────────────────────

/**
 * Detects contradiction across sub-agent outputs by checking whether any two
 * sub-agents declared different `semantics` values.
 *
 * Rationale: if two sub-agents measure different things (different semantics)
 * but produce similar-looking answers, the synthesizer must disambiguate using
 * the definitional-clarity pattern rather than presenting a single merged number.
 *
 * A single sub-agent or all sub-agents sharing semantics → no contradiction.
 */
export function detectContradiction(outputs: ReadonlyMap<string, SubAgentOutput>): boolean {
  if (outputs.size <= 1) return false

  const semanticsValues = [...outputs.values()].map((o) => o.semantics)
  const unique = new Set(semanticsValues)
  return unique.size > 1
}

// ─── renderContradictionClarity ───────────────────────────────────────────────

/**
 * Renders sub-agent outputs using the definitional-clarity pattern (R-03.23).
 *
 * Format: each sub-agent's summary is presented with its semantics label, allowing
 * the reader to understand that the values measure different things rather than
 * one being "wrong".
 *
 * Example: "5 projects with logged hours this month (timesheet); 6 projects currently
 *           in active state (project registry)."
 *
 * NEVER uses "disagree", "conflict", or "inconsistent" framing (§9 transparency tenet).
 */
export function renderContradictionClarity(outputs: ReadonlyMap<string, SubAgentOutput>): string {
  // Only include sub-agents with actual data. Failed agents (errored, all_tools_disabled, aborted)
  // are covered by buildDisclosureStatements — including their empty/error summaries here
  // would produce garbage prose clauses like " (tasks by status).".
  const entries = [...outputs.values()].filter(
    (o) => o.kind === 'completed' || o.kind === 'ceiling_hit',
  )
  if (entries.length === 0) return ''
  if (entries.length === 1) {
    const o = entries[0]!
    return `${o.summary} (${o.semantics}).`
  }

  const clauses = entries.map((o) => `${o.summary} (${o.semantics})`).join('; ')
  return `${clauses}.`
}

// ─── buildCitations ───────────────────────────────────────────────────────────

/**
 * Builds per-sub-agent citations from each sub-agent's tool provenance.
 *
 * R-03.33: Citation.subAgentKey is populated on every citation. The synthesizer
 * MUST NOT merge citations from different sub-agents into a single record that
 * loses the per-key attribution.
 *
 * One citation record per sub-agent that has non-empty tool provenance.
 * The claim uses the sub-agent's summary as the paragraph-level anchor.
 */
export function buildCitations(outputs: ReadonlyMap<string, SubAgentOutput>): Citation[] {
  const citations: Citation[] = []

  for (const [subAgentKey, output] of outputs) {
    if (output.sourceToolProvenance.length === 0) continue

    citations.push({
      claim: output.summary,
      sources: output.sourceToolProvenance,
      subAgentKey,
    })
  }

  return citations
}

// ─── buildDisclosureStatements ────────────────────────────────────────────────

/**
 * Builds explicit disclosure statements for sub-agents that failed to retrieve
 * data (R-03.31).
 *
 * R-03.31: When any phase-1 or phase-2 sub-agent returns `kind: 'all_tools_disabled'`,
 * `kind: 'errored'`, or `kind: 'aborted'`, the synthesizer MUST include an explicit
 * per-sub-agent status disclosure. Silently omitting a failed sub-agent is forbidden.
 *
 * Rationale: a permission gap or abort is actionable information the user can follow up
 * on with an admin (transparency over coherence).
 */
export function buildDisclosureStatements(outputs: ReadonlyMap<string, SubAgentOutput>): string[] {
  const disclosures: string[] = []

  for (const [subAgentKey, output] of outputs) {
    if (output.kind === 'all_tools_disabled') {
      disclosures.push(
        `Data from "${subAgentKey}" not retrieved — access denied or permission not granted for the required tools.`,
      )
    } else if (output.kind === 'errored') {
      disclosures.push(
        `Data from "${subAgentKey}" could not be processed — an error occurred during retrieval.`,
      )
    } else if (output.kind === 'aborted') {
      disclosures.push(
        `Data from "${subAgentKey}" was not completed — the request was cancelled${output.abortReason ? ` (${output.abortReason})` : ''}.`,
      )
    }
  }

  return disclosures
}
