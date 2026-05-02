/**
 * Gateway span helpers for the ToolGateway pipeline (plan 01, Task 6).
 *
 * Each pipeline step wraps its work in a `gateway:<step>` child span.
 * Span names are stable identifiers — do NOT change them without a migration
 * since dashboards and alerts reference these names.
 *
 * OTel is OFF in dev/tests when OTEL_EXPORTER_OTLP_ENDPOINT is unset — the
 * global tracer returns no-op spans so there is zero runtime cost.
 */

import { trace, SpanStatusCode, type Attributes, context } from '@opentelemetry/api'
import { isTripwire, type Tripwire } from '../guards/tripwire'

const tracer = trace.getTracer('agents.gateway')

/**
 * Valid step names in the gateway pipeline.
 * Kept as a union so callers get type-checked names and spans are predictable.
 */
export type GatewayStepName =
  | 'resolve'
  | 'taint-wrap-setup'
  | 'ceiling-check'
  | 'pre-write-abort-check'
  | 'invoke'
  | 'taint-wrap-result'
  | 'audit-emit'
  | 'cache-hit'
  | 'semantic-cache'

/**
 * Wrap `fn` in a `gateway:<name>` child span.
 *
 * - Records `attrs` on the span at start.
 * - If `fn` throws, records the exception, sets status ERROR, and re-throws.
 * - If `fn` returns a `Tripwire`, annotates the span with `tripwire_variant`
 *   and `disposition` and sets status ERROR. The tripwire is returned unchanged
 *   to the caller; it is NOT re-thrown (tripwires are values, not exceptions).
 * - Always ends the span (in a finally block).
 *
 * Context propagation: the span is started using the currently active OTel
 * context (honoured by the AsyncLocalStorageContextManager registered at
 * boot). We then run `fn` inside `context.with(spanCtx, fn)` so that any
 * nested `withGatewayStep` call or `recordStepAttrs` call sees the new span
 * as the active span — this is what produces the parent→child relationship.
 *
 * Why span status ERROR on tripwire: a tripwire is a pipeline-level failure
 * from the observability perspective even though it is an expected, handled
 * business outcome. Setting ERROR lets dashboards distinguish healthy tool
 * calls (status UNSET) from failures (status ERROR) without a custom attribute
 * query.
 */
export function withGatewayStep<T>(
  name: GatewayStepName,
  attrs: Attributes,
  fn: () => Promise<T> | T,
): Promise<T> {
  const span = tracer.startSpan(`gateway:${name}`)
  span.setAttributes(attrs)

  // Set this span as the active span for the duration of fn so that:
  //  1. recordStepAttrs() can annotate it via trace.getActiveSpan().
  //  2. Nested withGatewayStep calls inherit it as their parent.
  const spanCtx = trace.setSpan(context.active(), span)

  // We run `fn` synchronously inside `context.with` (non-async callback) so that
  // synchronous pipeline steps — like `resolve` — do NOT add an extra microtask
  // tick. This matters for the L1 cache coalescing path in ToolGateway, where the
  // first concurrent call must reach `registerInFlight` before the second call
  // executes `lookup`. Adding a microtask boundary would break the timing.
  //
  // The returned Promise is then awaited outside the `context.with` call. Context
  // propagation for async continuations (parent→child spans) is preserved by the
  // AsyncLocalStorageContextManager which propagates context across Promise
  // continuations automatically.
  let resultPromise: Promise<T>
  context.with(spanCtx, () => {
    try {
      const maybePromise = fn()
      if (maybePromise instanceof Promise) {
        resultPromise = maybePromise.then(
          (result) => {
            if (isTripwireValue(result)) {
              span.setAttributes({
                tripwire_variant: result.variant,
                disposition: result.disposition,
              })
              span.setStatus({ code: SpanStatusCode.ERROR, message: result.variant })
            }
            span.end()
            return result
          },
          (err: unknown) => {
            span.recordException(err instanceof Error ? err : new Error(String(err)))
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: err instanceof Error ? err.message : String(err),
            })
            span.end()
            throw err
          },
        )
      } else {
        // Synchronous fn — handle result immediately, within the context.with callback
        if (isTripwireValue(maybePromise)) {
          span.setAttributes({
            tripwire_variant: maybePromise.variant,
            disposition: maybePromise.disposition,
          })
          span.setStatus({ code: SpanStatusCode.ERROR, message: maybePromise.variant })
        }
        span.end()
        resultPromise = Promise.resolve(maybePromise)
      }
    } catch (err: unknown) {
      span.recordException(err instanceof Error ? err : new Error(String(err)))
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      })
      span.end()
      resultPromise = Promise.reject(err) as Promise<T>
    }
  })

  // context.with always calls its callback synchronously, so resultPromise is
  // always assigned by the time we reach here.
  return resultPromise!
}

/**
 * Add attributes to the currently active span (for mid-step annotations).
 * Safe to call even when OTel is disabled — `getActiveSpan()` returns
 * `undefined` when there is no active span (no-op MeterProvider / no context
 * manager registered), so this is always a no-op in that case.
 */
export function recordStepAttrs(attrs: Attributes): void {
  trace.getActiveSpan()?.setAttributes(attrs)
}

/**
 * Structural check that works on `unknown` values coming out of the generic
 * `fn` return. We cannot use the imported `isTripwire` predicate here because
 * that requires `ToolGatewayResult` which narrows to a specific union; the
 * generic `T` may be a step-internal return type (e.g. `{ kind: 'ok', ... }`
 * shapes from pipeline steps that don't extend `ToolGatewayResult`).
 *
 * The `isTripwire` predicate from tripwire.ts also uses `r.kind === 'tripwire'`
 * structurally, but its signature is `(r: ToolGatewayResult) => r is Tripwire`
 * which TS won't accept for an arbitrary `unknown`. We re-implement the same
 * minimal check here for the generic context.
 */
function isTripwireValue(value: unknown): value is Tripwire {
  return (
    value !== null &&
    typeof value === 'object' &&
    (value as Record<string, unknown>)['kind'] === 'tripwire'
  )
}

// Re-export isTripwire from guards for convenience in gateway orchestrator
export { isTripwire }
