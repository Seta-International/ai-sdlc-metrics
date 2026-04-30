/**
 * Golden-trace metrics — Plan 17 PR 4 Task 15.
 *
 * Two OTel counters partitioned by CI run outcome and replay miss tool name:
 *
 *   agent_golden_trace_ci_run_total{result}                          counter
 *     Per-CI-gate run. result ∈ {pass, regression, replay_failed} —
 *     emitted once per `runCiGate` invocation in GoldenTraceRunner.
 *
 *   agent_golden_trace_replay_miss_total{tool_name, trace_id}        counter
 *     Per replay-miss event in the runner's catch path. Used to localize
 *     which captured tool outputs are out-of-date when replay fails.
 *
 * Lazy-init pattern matches synthesizer-metrics.ts: instruments obtained from
 * the global MeterProvider on first use; tests reset via __INTERNAL_resetInstruments.
 *
 * Label cardinality: result has 3 values; tool_name is bounded by the registered
 * tool catalog; trace_id is high-cardinality but bounded per CI run (<= one per
 * golden trace). No tenant_id / user_id labels.
 */
import { metrics } from '@opentelemetry/api'
import type { Counter } from '@opentelemetry/api'

const METER_NAME = 'agents.golden_trace'

let _runs: Counter | undefined
let _misses: Counter | undefined

function runsCounter(): Counter {
  if (!_runs) {
    _runs = metrics.getMeter(METER_NAME).createCounter('agent_golden_trace_ci_run_total', {
      description: 'CI gate runs partitioned by result (pass | regression | replay_failed)',
    })
  }
  return _runs
}

function missesCounter(): Counter {
  if (!_misses) {
    _misses = metrics.getMeter(METER_NAME).createCounter('agent_golden_trace_replay_miss_total', {
      description: 'Replay miss events partitioned by tool_name + trace_id',
    })
  }
  return _misses
}

/**
 * @internal — test-only. Drops cached instrument handles so the next helper
 * call re-acquires them from the currently registered MeterProvider. Required
 * because lazy init binds to whatever provider was global on first call.
 */
export function __INTERNAL_resetInstruments(): void {
  _runs = undefined
  _misses = undefined
}

export type GoldenTraceCiResult = 'pass' | 'regression' | 'replay_failed'

export function recordGoldenTraceCiRun(opts: { result: GoldenTraceCiResult }): void {
  runsCounter().add(1, { result: opts.result })
}

export function recordReplayMiss(opts: { toolName: string; traceId: string }): void {
  missesCounter().add(1, { tool_name: opts.toolName, trace_id: opts.traceId })
}
