/**
 * Sub-agent ReAct loop metrics — Plan 17 PR 2 Task 7.
 *
 * Two counters partitioned by sub-agent identity, completion outcome, and
 * (for the failure counter) the originating tool + tripwire variant + severity:
 *
 *   agent_sub_agent_iterations_total{sub_agent_key, outcome}     counter
 *     Per-run termination event for the sub-agent ReAct loop.
 *     outcome ∈ {completed, ceiling_hit, errored, aborted} —
 *     the four real `SubAgentOutput.kind` branches the runner adapter emits.
 *
 *   agent_sub_agent_tool_failures_total{sub_agent_key, tool_name,
 *     tripwire_kind, severity}                                    counter
 *     Per-tool-call failure event inside the loop.
 *     severity = 'soft' for retry-disposition tripwires the LLM sees;
 *     severity = 'hard' for abort-disposition tripwires that terminate the run.
 *     tripwire_kind is the tripwire `variant` (e.g. 'validation_failed',
 *     'permission_denied', 'infra_error', 'ceiling_breach_bytes', …).
 *
 * Lazy-init pattern matches cost-metrics.ts / gateway-metrics.ts: instruments
 * are obtained from the global MeterProvider on first use, so production boot
 * (SDK started before request handling) and tests (provider registered before
 * helpers fire) both work without explicit ordering.
 *
 * Label cardinality: sub_agent_key is bounded by the SubAgentRegistry; outcome
 * has 4 values; tool_name is bounded by ToolRegistry; tripwire_kind is bounded
 * by the Tripwire variant union; severity has 2 values. No tenant_id, user_id,
 * or trace_id labels are emitted (R-05.30 cardinality guardrail).
 */

import { metrics, type Counter } from '@opentelemetry/api'

const METER_NAME = 'agents.sub_agent'

let _iterations: Counter | undefined
let _toolFailures: Counter | undefined

function iterationsCounter(): Counter {
  if (!_iterations) {
    _iterations = metrics.getMeter(METER_NAME).createCounter('agent_sub_agent_iterations_total', {
      description:
        'Sub-agent ReAct loop completions, partitioned by outcome ' +
        '(completed / ceiling_hit / errored / aborted).',
    })
  }
  return _iterations
}

function toolFailuresCounter(): Counter {
  if (!_toolFailures) {
    _toolFailures = metrics
      .getMeter(METER_NAME)
      .createCounter('agent_sub_agent_tool_failures_total', {
        description:
          'Tool-call failures inside sub-agent ReAct loops. ' +
          'severity ∈ {soft, hard}; tripwire_kind = Tripwire.variant.',
      })
  }
  return _toolFailures
}

/**
 * @internal — test-only. Drops cached instrument handles so the next helper
 * call re-acquires them from the currently registered MeterProvider. Required
 * because lazy init binds to whatever provider was global on first call.
 */
export function __INTERNAL_resetInstruments(): void {
  _iterations = undefined
  _toolFailures = undefined
}

/**
 * Record one ReAct loop termination. Call exactly once per sub-agent run, on
 * every exit path, with the resolved `SubAgentOutput.kind` (or `'aborted'`
 * for the pre-/in-flight abort branches).
 */
export function recordSubAgentIteration(opts: {
  subAgentKey: string
  outcome: 'completed' | 'ceiling_hit' | 'errored' | 'aborted'
}): void {
  iterationsCounter().add(1, {
    sub_agent_key: opts.subAgentKey,
    outcome: opts.outcome,
  })
}

/**
 * Record one tool-call failure. Soft severity is emitted by the gateway bridge
 * inside the per-call execute() closure on retry-disposition tripwires; hard
 * severity is emitted by the runner adapter on the HardTripwireError exit
 * branch.
 *
 * `tripwireKind` is sourced from `Tripwire.variant` — never from a stale
 * `tripwireKind` field that no longer exists on the type.
 */
export function recordSubAgentToolFailure(opts: {
  subAgentKey: string
  toolName: string
  tripwireKind: string
  severity: 'soft' | 'hard'
}): void {
  toolFailuresCounter().add(1, {
    sub_agent_key: opts.subAgentKey,
    tool_name: opts.toolName,
    tripwire_kind: opts.tripwireKind,
    severity: opts.severity,
  })
}
