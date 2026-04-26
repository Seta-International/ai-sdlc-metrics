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
 *
 * `failureCause` is the discriminator (renamed from `cause` to avoid colliding
 * with the standard `Error.cause` slot, which we use here to preserve the
 * underlying error and its stack trace).
 */

export type SynthesizerStreamFailureCause =
  | 'pre_shape_failure'
  | 'stream_error'
  | 'schema_validation'

export class SynthesizerStreamFailureError extends Error {
  constructor(
    public readonly failureCause: SynthesizerStreamFailureCause,
    underlyingCause: unknown,
  ) {
    const causeMsg =
      underlyingCause instanceof Error ? underlyingCause.message : String(underlyingCause)
    super(`SynthesizerStreamFailure: ${failureCause} — ${causeMsg}`, {
      cause: underlyingCause instanceof Error ? underlyingCause : new Error(causeMsg),
    })
    this.name = 'SynthesizerStreamFailureError'
  }
}
