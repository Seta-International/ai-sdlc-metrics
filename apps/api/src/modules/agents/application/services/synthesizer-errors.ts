/**
 * Synthesizer typed errors — Plan 18 §1.
 *
 * Pre-shape failures (the LLM stream errors before declaring a shape) are not
 * recoverable: the adapter rethrows `SynthesizerStreamFailureError` so the
 * orchestrator can surface a turn.ended error.
 *
 * Post-shape failures (stream errors mid-content, or `finalObject` schema
 * validation) are recoverable: the adapter falls back to deterministic prose
 * and returns `turnEndedReason: 'errored'` instead of throwing. This file
 * defines the error type used only on the rethrow path.
 */

export type SynthesizerStreamFailureCause =
  | 'pre_shape_failure'
  | 'stream_error'
  | 'schema_validation'

export class SynthesizerStreamFailureError extends Error {
  constructor(
    public readonly failureCause: SynthesizerStreamFailureCause,
    public readonly meta: { cause: string },
  ) {
    super(`SynthesizerStreamFailure: ${failureCause} — ${meta.cause}`)
    this.name = 'SynthesizerStreamFailureError'
  }
}
