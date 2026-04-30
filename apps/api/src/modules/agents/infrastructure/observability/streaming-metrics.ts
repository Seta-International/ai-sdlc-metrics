/**
 * Streaming / SSE / cancellation metrics.
 *
 * Instruments are initialised lazily on first use via `getInstruments()`.
 * This ensures the global MeterProvider is already registered by the time
 * metrics are first recorded — in production the SDK is started before any
 * request is handled; in tests the spec file sets `metrics.setGlobalMeterProvider`
 * before calling the helper functions.
 *
 * For background on the lazy-init pattern, see gateway-metrics.ts.
 *
 * ── Instruments ──────────────────────────────────────────────────
 *
 * agent_turn_total{tenant_id, topology, reason}              counter
 *   Total turns started and concluded by reason.
 *   topology ∈ 'bounded' | 'iterative'. reason = TurnEndReason.
 *
 * agent_turn_duration_ms{tenant_id, reason}                  histogram
 *   Wall-time per turn in ms, labelled by end reason.
 *
 * agent_abort_total{tenant_id, source, reason}               counter
 *   Total aborted turns. source ∈ 'user' | 'timeout' | 'system'.
 *
 * agent_ordering_violation_total{producer}                   counter
 *   SSE state-machine ordering violations (P2 alert on any positive).
 *
 * agent_identity_key_write_attempted_total                   counter (no labels — P1)
 *   Denylist write attempts at the RequestContextDiscipline layer.
 *   P1 alert on any positive value.
 *
 * agent_sse_backpressure_total{tenant_id}                    counter
 *   SSE writes that stall due to slow client (R-06 §7 backpressure).
 *
 * agent_turn_force_stopped_total{tenant_id, actor_role}      counter
 *   Non-self cancels. actor_role ∈ 'admin' | 'platform_admin'.
 *   Self-cancel excluded — only administrative force-stops are counted here.
 *
 * agent_active_turn_sweep_total{tenant_id, cause}            counter
 *   Sweep of dead/orphaned active-turn rows.
 *   cause ∈ 'heartbeat_expired' | 'pod_crash_detected'.
 *
 * agent_draft_persist_failure_total{tenant_id}               counter
 *   Draft DB write failures that trigger the fallback path.
 *   Non-zero ⇒ P2 alert.
 *
 * agent_progress_event_total{tenant_id, cause}               counter
 *   Progress events emitted for retry/fallback visibility (≥500ms).
 *   cause ∈ 'vendor_retry' | 'fallback' | 'long_tool'.
 *
 * ── Label cardinality guardrail ─────────────────────────────────────────────
 *
 * BLOCKED_LABELS = [user_id, conversation_id, trace_id, delegation_id, schedule_id]
 * None of the above labels appear on any instrument defined here.
 */

import { metrics, ValueType, type Counter, type Histogram } from '@opentelemetry/api'

interface StreamingInstruments {
  /** agent_turn_total{tenant_id, topology, reason} */
  turnTotal: Counter
  /** agent_turn_duration_ms{tenant_id, reason} */
  turnDurationMs: Histogram
  /** agent_abort_total{tenant_id, source, reason} */
  abortTotal: Counter
  /** agent_ordering_violation_total{producer} */
  orderingViolationTotal: Counter
  /** agent_identity_key_write_attempted_total (no labels) */
  identityKeyWriteAttemptedTotal: Counter
  /** agent_sse_backpressure_total{tenant_id} */
  sseBackpressureTotal: Counter
  /** agent_turn_force_stopped_total{tenant_id, actor_role} */
  turnForceStoppedTotal: Counter
  /** agent_active_turn_sweep_total{tenant_id, cause} */
  activeTurnSweepTotal: Counter
  /** agent_draft_persist_failure_total{tenant_id} */
  draftPersistFailureTotal: Counter
  /** agent_progress_event_total{tenant_id, cause} */
  progressEventTotal: Counter
}

let _instruments: StreamingInstruments | undefined

function getInstruments(): StreamingInstruments {
  if (_instruments) return _instruments

  const meter = metrics.getMeter('agents.streaming')

  _instruments = {
    /**
     * Counts turns concluded by end reason.
     * Labels: tenant_id, topology, reason.
     * topology ∈ 'bounded' | 'iterative'. reason = TurnEndReason.
     * No user_id.
     */
    turnTotal: meter.createCounter('agent_turn_total', {
      description:
        'Total turns concluded per tenant, topology, and end reason. ' + 'No user_id label.',
      valueType: ValueType.INT,
    }),

    /**
     * Histogram of turn wall-time in ms.
     * Labels: tenant_id, reason.
     * unit: ms.
     */
    turnDurationMs: meter.createHistogram('agent_turn_duration_ms', {
      description: 'Turn duration in ms per tenant and end reason.',
      unit: 'ms',
      valueType: ValueType.DOUBLE,
    }),

    /**
     * Counts aborted turns.
     * Labels: tenant_id, source, reason.
     * source ∈ 'user' | 'timeout' | 'system'.
     * No user_id.
     */
    abortTotal: meter.createCounter('agent_abort_total', {
      description:
        'Aborted turns per tenant, abort source, and cancellation reason. ' + 'No user_id label.',
      valueType: ValueType.INT,
    }),

    /**
     * Counts SSE state-machine ordering violations.
     * Labels: producer (identifies the emitting component).
     * P2 alert on any positive value in steady state.
     */
    orderingViolationTotal: meter.createCounter('agent_ordering_violation_total', {
      description:
        'SSE state-machine ordering violations per producing component. ' +
        'P2 alert on any positive value.',
      valueType: ValueType.INT,
    }),

    /**
     * Counts identity-key write attempts at the RequestContextDiscipline layer.
     * No labels — P1 alert on any positive value. High-cardinality info lives on traces.
     */
    identityKeyWriteAttemptedTotal: meter.createCounter(
      'agent_identity_key_write_attempted_total',
      {
        description:
          'Identity-key write attempts caught by RequestContextDiscipline. ' +
          'No labels — P1 alert on any positive value. ' +
          'Per-attempt detail lives on the security audit trace.',
        valueType: ValueType.INT,
      },
    ),

    /**
     * Counts SSE write backpressure events.
     * Labels: tenant_id.
     */
    sseBackpressureTotal: meter.createCounter('agent_sse_backpressure_total', {
      description: 'SSE write events throttled by client backpressure per tenant.',
      valueType: ValueType.INT,
    }),

    /**
     * Counts administrative force-stops.
     * Labels: tenant_id, actor_role.
     * actor_role ∈ 'admin' | 'platform_admin'. Self-cancel is excluded.
     * Trends inform force-stop UX tuning.
     */
    turnForceStoppedTotal: meter.createCounter('agent_turn_force_stopped_total', {
      description:
        'Administrative force-stop events per tenant and actor role. ' +
        'Self-cancels excluded. actor_role ∈ {admin, platform_admin}.',
      valueType: ValueType.INT,
    }),

    /**
     * Counts active-turn sweep events.
     * Labels: tenant_id, cause.
     * cause ∈ 'heartbeat_expired' | 'pod_crash_detected'.
     * P2 alert on sustained positive rate (indicates pod instability).
     */
    activeTurnSweepTotal: meter.createCounter('agent_active_turn_sweep_total', {
      description:
        'Active-turn registry sweep events per tenant and cause. ' +
        'cause ∈ {heartbeat_expired, pod_crash_detected}. ' +
        'P2 alert on sustained positive rate.',
      valueType: ValueType.INT,
    }),

    /**
     * Counts draft persist failures that trigger the fallback path.
     * Labels: tenant_id.
     * Non-zero ⇒ P2 alert.
     */
    draftPersistFailureTotal: meter.createCounter('agent_draft_persist_failure_total', {
      description:
        'Draft DB write failures that invoked the fallback path per tenant. ' +
        'Non-zero triggers P2 alert.',
      valueType: ValueType.INT,
    }),

    /**
     * Counts progress events emitted for retry/fallback visibility (≥500ms).
     * Labels: tenant_id, cause.
     * cause ∈ 'vendor_retry' | 'fallback' | 'long_tool'.
     * Lets dashboards quantify perceived-latency events.
     */
    progressEventTotal: meter.createCounter('agent_progress_event_total', {
      description:
        'Progress events emitted per tenant and cause. ' +
        'cause ∈ {vendor_retry, fallback, long_tool}.',
      valueType: ValueType.INT,
    }),
  }

  return _instruments
}

/**
 * @internal — test-only. Clears the cached instrument instances so the next
 * helper call re-acquires a fresh meter from the currently registered provider.
 * Must only be called from test setup/teardown.
 */
export function __INTERNAL_resetInstruments(): void {
  _instruments = undefined
}

/**
 * Record a concluded turn.
 * Call once per turn at StreamEmitter.close or StreamEmitter.error.
 *
 * Labels: tenant_id, topology, reason. No user_id.
 */
export function recordTurnTotal(
  tenantId: string,
  topology: 'bounded' | 'iterative',
  reason: string,
): void {
  getInstruments().turnTotal.add(1, { tenant_id: tenantId, topology, reason })
}

/**
 * Record turn wall-time.
 * Call once per turn at StreamEmitter.close or StreamEmitter.error.
 *
 * Labels: tenant_id, reason.
 * unit: ms.
 */
export function recordTurnDuration(tenantId: string, reason: string, durationMs: number): void {
  getInstruments().turnDurationMs.record(durationMs, { tenant_id: tenantId, reason })
}

/**
 * Record an aborted turn.
 * Call when AbortCoordinator.captureReason returns a non-undefined reason.
 *
 * Labels: tenant_id, source, reason.
 * source ∈ 'user' | 'timeout' | 'system'. No user_id.
 */
export function recordAbortTotal(
  tenantId: string,
  source: 'user' | 'timeout' | 'system',
  reason: string,
): void {
  getInstruments().abortTotal.add(1, { tenant_id: tenantId, source, reason })
}

/**
 * Record an SSE state-machine ordering violation.
 * Call inside nextState() when an invalid transition is detected.
 * producer identifies the component that emitted the out-of-order event.
 *
 * Labels: producer.
 */
export function recordOrderingViolation(producer: string): void {
  getInstruments().orderingViolationTotal.add(1, { producer })
}

/**
 * Record an identity-key write attempt caught by RequestContextDiscipline.
 * Call from RequestContextDiscipline.set when an identity key is detected.
 *
 * No labels — P1 alert on any positive value.
 */
export function recordIdentityKeyWriteAttempted(): void {
  getInstruments().identityKeyWriteAttemptedTotal.add(1)
}

/**
 * Record an SSE write backpressure event.
 * Call when the Fastify write queue saturates for a given tenant's SSE response.
 *
 * Labels: tenant_id.
 */
export function recordSseBackpressure(tenantId: string): void {
  getInstruments().sseBackpressureTotal.add(1, { tenant_id: tenantId })
}

/**
 * Record an administrative force-stop.
 * Call in AgentCancelController after a successful non-self cancel.
 * Self-cancels are excluded — only admin/platform-admin force-stops here.
 *
 * Labels: tenant_id, actor_role. actor_role ∈ 'admin' | 'platform_admin'.
 */
export function recordTurnForceStopped(
  tenantId: string,
  actorRole: 'admin' | 'platform_admin',
): void {
  getInstruments().turnForceStoppedTotal.add(1, { tenant_id: tenantId, actor_role: actorRole })
}

/**
 * Record an active-turn sweep event.
 * Call in the sweep job when a stale row is cleaned up.
 *
 * Labels: tenant_id, cause. cause ∈ 'heartbeat_expired' | 'pod_crash_detected'.
 */
export function recordActiveTurnSweep(
  tenantId: string,
  cause: 'heartbeat_expired' | 'pod_crash_detected',
): void {
  getInstruments().activeTurnSweepTotal.add(1, { tenant_id: tenantId, cause })
}

/**
 * Record a draft persist failure.
 * Call in the catch block of the approval-inbox insert inside the turn handler.
 * Non-zero triggers a P2 alert.
 *
 * Labels: tenant_id.
 */
export function recordDraftPersistFailure(tenantId: string): void {
  getInstruments().draftPersistFailureTotal.add(1, { tenant_id: tenantId })
}

/**
 * Record a progress event emitted to the SSE stream.
 * Call whenever StreamEmitter.emit({ type: 'progress' }) is called.
 *
 * Labels: tenant_id, cause. cause ∈ 'vendor_retry' | 'fallback' | 'long_tool'.
 */
export function recordProgressEvent(
  tenantId: string,
  cause: 'vendor_retry' | 'fallback' | 'long_tool',
): void {
  getInstruments().progressEventTotal.add(1, { tenant_id: tenantId, cause })
}
