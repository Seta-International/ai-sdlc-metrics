/**
 * Synthesizer metrics — Plan 17 PR 3 Task 12.
 *
 * Three OTel instruments partitioned by the synthesizer's discriminated-union
 * `shape`, the surface (global-chat / inline / etc.), and outcome:
 *
 *   agent_synthesizer_call_total{shape, surface, outcome}            counter
 *     Per-synthesize() success-path invocation. outcome ∈ {completed, errored};
 *     today only `completed` is emitted (the adapter falls back to deterministic
 *     prose on post-shape errors and rethrows on pre-shape errors), but the
 *     union retains `errored` for symmetry with iteration-metrics.
 *
 *   agent_synthesizer_latency_ms{shape, surface, outcome}            histogram
 *     End-to-end synthesizer LLM duration in milliseconds, including streaming
 *     and any fallback rendering. Recorded once per synthesize() exit path
 *     (success, fallback, throw) via try/finally in SynthesizerAdapter.
 *
 *   agent_synthesizer_fallback_total{cause}                          counter
 *     Per-fallback event. cause matches the SynthesizerStreamFailureCause
 *     union exported from pipeline-errors.ts:
 *     'pre_shape_failure' | 'stream_error' | 'schema_validation'.
 *
 * Lazy-init pattern matches sub-agent-metrics.ts / cost-metrics.ts: instruments
 * are obtained from the global MeterProvider on first use, so production boot
 * (SDK started before request handling) and tests (provider registered before
 * helpers fire) both work without explicit ordering.
 *
 * Label cardinality: shape ∈ {short-answer, narrative, list, table, chart,
 * unknown} (6 values); surface is bounded by the surface enum; outcome has 2
 * values; cause has 3 values. No tenant_id, user_id, or trace_id labels are
 * emitted (R-05.30 cardinality guardrail).
 */

import { metrics } from '@opentelemetry/api'
import type { Counter, Histogram } from '@opentelemetry/api'
import type { SynthesizerStreamFailureCause } from '../../application/services/pipeline-errors'

const METER_NAME = 'agents.synthesizer'

let _calls: Counter | undefined
let _latency: Histogram | undefined
let _fallbacks: Counter | undefined

function callsCounter(): Counter {
  if (!_calls) {
    _calls = metrics.getMeter(METER_NAME).createCounter('agent_synthesizer_call_total', {
      description: 'Synthesizer LLM invocations partitioned by shape/surface/outcome',
    })
  }
  return _calls
}

function latencyHistogram(): Histogram {
  if (!_latency) {
    _latency = metrics.getMeter(METER_NAME).createHistogram('agent_synthesizer_latency_ms', {
      description: 'End-to-end synthesizer LLM duration including streaming + fallback',
      unit: 'ms',
    })
  }
  return _latency
}

function fallbacksCounter(): Counter {
  if (!_fallbacks) {
    _fallbacks = metrics.getMeter(METER_NAME).createCounter('agent_synthesizer_fallback_total', {
      description: 'Synthesizer fallback events partitioned by cause',
    })
  }
  return _fallbacks
}

/**
 * @internal — test-only. Drops cached instrument handles so the next helper
 * call re-acquires them from the currently registered MeterProvider. Required
 * because lazy init binds to whatever provider was global on first call.
 */
export function __INTERNAL_resetInstruments(): void {
  _calls = undefined
  _latency = undefined
  _fallbacks = undefined
}

/**
 * Record one synthesizer invocation. Called by the adapter on the success exit
 * path (`turnEndedReason: 'completed'`). Fallback paths record only the
 * fallback counter + latency, not the call counter.
 */
export function recordSynthesizerCall(opts: {
  shape: string
  surface: string
  outcome: 'completed' | 'errored'
}): void {
  callsCounter().add(1, {
    shape: opts.shape,
    surface: opts.surface,
    outcome: opts.outcome,
  })
}

/**
 * Record end-to-end synthesizer latency. Called once per synthesize() exit
 * path (success, fallback, throw) via try/finally in SynthesizerAdapter.
 */
export function recordSynthesizerLatency(opts: {
  shape: string
  surface: string
  outcome: 'completed' | 'errored'
  durationMs: number
}): void {
  latencyHistogram().record(opts.durationMs, {
    shape: opts.shape,
    surface: opts.surface,
    outcome: opts.outcome,
  })
}

/**
 * Record one synthesizer fallback event. cause matches the
 * SynthesizerStreamFailureCause union (pre_shape_failure | stream_error |
 * schema_validation).
 */
export function recordSynthesizerFallback(opts: { cause: SynthesizerStreamFailureCause }): void {
  fallbacksCounter().add(1, { cause: opts.cause })
}
