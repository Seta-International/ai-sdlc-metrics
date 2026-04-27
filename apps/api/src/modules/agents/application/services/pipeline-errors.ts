/**
 * Pipeline typed errors + classifyPipelineError — Plan 18 §1.
 *
 * Each pipeline service throws one of three typed errors when its turn slice
 * fails irrecoverably. The controller catches these at the top of the live
 * turn pipeline and maps them onto an SSE close-error `cause` via
 * `classifyPipelineError`. Anything else becomes `internal_error`.
 *
 * All three errors expose a `failureCause` discriminator (renamed from `cause`
 * to avoid colliding with the standard `Error.cause` slot, which we use to
 * preserve the underlying error and its stack trace).
 */

// ─── Router errors ────────────────────────────────────────────────────────────

export type RouterLlmFailureCause = 'llm_5xx' | 'llm_timeout' | 'auth_error'

export class RouterLlmFailureError extends Error {
  constructor(
    public readonly failureCause: RouterLlmFailureCause,
    underlyingCause?: unknown,
  ) {
    const causeMsg =
      underlyingCause === undefined
        ? failureCause
        : underlyingCause instanceof Error
          ? underlyingCause.message
          : String(underlyingCause)
    super(`RouterLlmFailure: ${failureCause} — ${causeMsg}`, {
      cause: underlyingCause instanceof Error ? underlyingCause : undefined,
    })
    this.name = 'RouterLlmFailureError'
  }
}

export class RouterParseEscalationError extends Error {
  constructor(message: string, underlyingCause?: unknown) {
    super(message, {
      cause: underlyingCause instanceof Error ? underlyingCause : undefined,
    })
    this.name = 'RouterParseEscalationError'
  }
}

// ─── Synthesizer errors ───────────────────────────────────────────────────────

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

// ─── Classifier ───────────────────────────────────────────────────────────────

export type SseErrorCause = 'router_failure' | 'synthesizer_failure' | 'internal_error'

export function classifyPipelineError(err: unknown): SseErrorCause {
  if (err instanceof RouterLlmFailureError) return 'router_failure'
  if (err instanceof RouterParseEscalationError) return 'router_failure'
  if (err instanceof SynthesizerStreamFailureError) return 'synthesizer_failure'
  return 'internal_error'
}
