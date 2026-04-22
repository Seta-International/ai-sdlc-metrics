/**
 * WindowedSummaries — Plan 04 L2 memory window shapes (R-04.11, R-04.12).
 *
 * γ (global) window — for global chat surface:
 *   - last 3 verbatim turn summaries
 *   - last 10 compressed (cached concat + nano)
 *   - rolling background summary (updated every 3 user turns, R-04.26c)
 *
 * α (inline) window — for inline copilot surfaces:
 *   - last N verbatim (default 5, configurable per surface)
 *
 * Summary text is always delimiter-wrapped at inject time (R-04.26b) by WindowBuilder:
 *   <conversation_summary source="post_turn_nano">...</conversation_summary>
 * This ensures downstream LLMs treat summaries as untrusted context, not system instructions.
 *
 * RouterPromptBuilder pattern-matches on verbatim.length and rolling nullability
 * — the builder interface is stable across γ/α variants.
 */

export type VerbatimSummary = {
  /** Correlates to the kernel audit trace for this turn. */
  turnTraceId: string
  /** Delimiter-wrapped summary text (R-04.26b). */
  summary: string
}

export type WindowedSummaries = {
  /** γ/α verbatim entries; ordered oldest → newest. */
  verbatim: ReadonlyArray<VerbatimSummary>
  /** γ only: last 10 compressed summaries. Empty array for α windows. */
  compressed: ReadonlyArray<string>
  /** γ only: rolling background summary updated every 3 user turns. Null for α or when not yet computed. */
  rolling: string | null
}
