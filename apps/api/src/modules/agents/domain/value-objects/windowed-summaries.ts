/**
 * WindowedSummaries — minimal stub type for the γ/α memory windows.
 *
 * Minimal stub shape; Plan 04 will extend with L3.5 scratchpad references.
 *
 * γ (gamma) — prior-turn summaries (short-term, newest last in the array).
 * α (alpha) — conversation-level rolling summary (null when the conversation is
 *             too short to have been compressed).
 *
 * The RouterPromptBuilder reads this shape to render the "recent summary window"
 * section of the developer message (Plan 02 §5 step 6). Plan 04 will replace this
 * stub with a richer type without breaking the builder's interface — the builder
 * pattern-matches on gamma.length and alpha nullability.
 */

export type WindowedSummaries = {
  /** γ = prior-turn summaries (short-term); entries ordered oldest → newest. */
  gamma: ReadonlyArray<{ turnTraceId: string; summary: string }>
  /** α = conversation-level rolling summary; null when not yet computed. */
  alpha: string | null
}
