/**
 * Pipeline-level metrics — Plan 18 Task 9.
 *
 * Three OTel instruments covering the live turn-pipeline composition:
 *
 *   agent_pipeline_dispatch_total{kind, outcome}                      counter
 *     Per-turn dispatch event emitted from the RUN_PIPELINE_FN factory exit
 *     (try/finally). kind ∈ {bounded, iterative, disambiguation};
 *     outcome ∈ {completed, cancelled, refused, error}.
 *
 *   agent_bounded_executor_phase_duration_ms{phase, outcome}          histogram
 *     Wall-clock duration of each BoundedExecutor phase loop in milliseconds.
 *     phase ∈ {phase-1, phase-2}; outcome ∈ {completed, cancelled, errored}.
 *     Recorded once per phase that actually started executing — phases that
 *     never began (pre-phase abort) are skipped.
 *
 *   agent_bounded_executor_drafts_total{phase, sub_agent_key}         counter
 *     Total draft proposals returned by sub-agents inside BoundedExecutor,
 *     partitioned by phase + originating sub-agent key. No-op when a
 *     sub-agent returns zero drafts.
 *
 * Lazy-init pattern matches sub-agent-metrics.ts / synthesizer-metrics.ts:
 * instruments are obtained from the global MeterProvider on first use, so
 * production boot (SDK started before request handling) and tests (provider
 * registered before helpers fire) both work without explicit ordering.
 *
 * Label cardinality: kind has 3 values; outcome has 4; phase has 2;
 * sub_agent_key is bounded by SubAgentRegistry. No tenant_id, user_id, or
 * trace_id labels are emitted (cardinality guardrail).
 */

import { metrics } from '@opentelemetry/api'
import type { Counter, Histogram } from '@opentelemetry/api'

const METER_NAME = 'agents.pipeline'

let _dispatch: Counter | undefined
let _phaseDuration: Histogram | undefined
let _drafts: Counter | undefined

function dispatchCounter(): Counter {
  if (!_dispatch) {
    _dispatch = metrics.getMeter(METER_NAME).createCounter('agent_pipeline_dispatch_total', {
      description:
        'Live turn-pipeline dispatch events partitioned by routed kind ' +
        '(bounded / iterative / disambiguation) and outcome ' +
        '(completed / cancelled / refused / error).',
    })
  }
  return _dispatch
}

function phaseDurationHistogram(): Histogram {
  if (!_phaseDuration) {
    _phaseDuration = metrics
      .getMeter(METER_NAME)
      .createHistogram('agent_bounded_executor_phase_duration_ms', {
        description:
          'Wall-clock duration of BoundedExecutor phase-1 / phase-2 loops, ' +
          'partitioned by outcome (completed / cancelled / errored).',
        unit: 'ms',
      })
  }
  return _phaseDuration
}

function draftsCounter(): Counter {
  if (!_drafts) {
    _drafts = metrics.getMeter(METER_NAME).createCounter('agent_bounded_executor_drafts_total', {
      description:
        'Draft proposals returned by sub-agents inside BoundedExecutor, ' +
        'partitioned by phase and originating sub-agent key.',
    })
  }
  return _drafts
}

/**
 * @internal — test-only. Drops cached instrument handles so the next helper
 * call re-acquires them from the currently registered MeterProvider. Required
 * because lazy init binds to whatever provider was global on first call.
 */
export function __INTERNAL_resetInstruments(): void {
  _dispatch = undefined
  _phaseDuration = undefined
  _drafts = undefined
}

/**
 * Record one pipeline dispatch event. Called from the RUN_PIPELINE_FN factory
 * via try/finally on every exit path (return, throw, cancellation).
 */
export function recordPipelineDispatch(opts: {
  kind: 'bounded' | 'iterative' | 'disambiguation'
  outcome: 'completed' | 'cancelled' | 'refused' | 'error'
}): void {
  dispatchCounter().add(1, { kind: opts.kind, outcome: opts.outcome })
}

/**
 * Record the wall-clock duration of one BoundedExecutor phase loop. Skip when
 * the phase never started executing (pre-phase abort).
 */
export function recordBoundedExecutorPhaseDuration(opts: {
  phase: 'phase-1' | 'phase-2'
  outcome: 'completed' | 'cancelled' | 'errored'
  durationMs: number
}): void {
  phaseDurationHistogram().record(opts.durationMs, {
    phase: opts.phase,
    outcome: opts.outcome,
  })
}

/**
 * Record draft proposals returned by a single sub-agent inside BoundedExecutor.
 * No-op when count <= 0 (callers may pass `out.drafts?.length ?? 0` blindly).
 */
export function recordBoundedExecutorDrafts(opts: {
  phase: 'phase-1' | 'phase-2'
  subAgentKey: string
  count: number
}): void {
  if (opts.count <= 0) return
  draftsCounter().add(opts.count, {
    phase: opts.phase,
    sub_agent_key: opts.subAgentKey,
  })
}
