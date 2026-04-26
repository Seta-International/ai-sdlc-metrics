/**
 * Synthesizer metrics — stub.
 *
 * TODO(Plan 17 PR 3 Task 12): replace these no-op bodies with real OTel counter
 * instrumentation (agent_synthesizer_call_total, agent_synthesizer_fallback_total)
 * matching the conventions in sub-agent-metrics.ts and gateway-metrics.ts.
 *
 * The signatures below are the contract the SynthesizerAdapter (Task 11)
 * consumes. Task 12 swaps the bodies; callers do not change.
 */

export function recordSynthesizerCall(_opts: {
  shape: string
  surface: string
  outcome: 'completed' | 'errored'
}): void {
  // no-op stub — real OTel counter wired in Task 12
}

export function recordSynthesizerFallback(_opts: {
  cause: 'pre_shape_failure' | 'stream_error' | 'schema_validation'
}): void {
  // no-op stub — real OTel counter wired in Task 12
}
