/**
 * Observability meta-metrics for Plan 07 (R-07.§8).
 *
 * Instruments are initialised lazily on first use via `getInstruments()`.
 * This ensures the global MeterProvider is already registered by the time
 * metrics are first recorded — in production the SDK is started before any
 * request is handled; in tests the spec file sets `metrics.setGlobalMeterProvider`
 * before calling the helper functions.
 *
 * For background on the lazy-init pattern, see gateway-metrics.ts.
 *
 * ── Tenant quota gauge ────────────────────────────────────────────────────────
 *
 * `agent_tenant_trace_quota_used` is an observable gauge backed by an
 * external Map. The batch-observable callback captures the Map by reference;
 * `setTenantTraceQuotaUsed` updates the Map. The callback fires on every
 * metric collection cycle (forceFlush in tests, periodic export in prod).
 */

import {
  metrics,
  ValueType,
  type Counter,
  type ObservableGauge,
  type BatchObservableResult,
} from '@opentelemetry/api'

// ─── Instrument interface ──────────────────────────────────────────────────────

interface ObservabilityInstruments {
  /** agent_sampling_decision_total{capture, reason} */
  samplingDecisionTotal: Counter
  /** agent_pii_redaction_total{tool_name} */
  piiRedactionTotal: Counter
  /** agent_usage_recorded_on_non_leaf_total */
  usageOnNonLeafTotal: Counter
  /** agent_trace_audit_join_miss_total */
  traceAuditJoinMissTotal: Counter
  /** agent_cross_tenant_leak_canary_total{result} */
  leakCanaryTotal: Counter
  /** agent_tenant_trace_quota_used{tenant_id} — observable gauge */
  tenantTraceQuotaUsed: ObservableGauge
}

// ─── Module-level state ────────────────────────────────────────────────────────

/** Per-tenant quota fraction (0.0–1.0) reported by setTenantTraceQuotaUsed. */
const _tenantQuotaMap = new Map<string, number>()

let _instruments: ObservabilityInstruments | undefined

// ─── Lazy instrument cache ─────────────────────────────────────────────────────

function getInstruments(): ObservabilityInstruments {
  if (_instruments) return _instruments

  const meter = metrics.getMeter('agents.observability')

  const samplingDecisionTotal = meter.createCounter('agent_sampling_decision_total', {
    description: 'Sampling decisions (capture/skip) with the root reason.',
    valueType: ValueType.INT,
  })

  const piiRedactionTotal = meter.createCounter('agent_pii_redaction_total', {
    description: 'PII redaction events per tool.',
    valueType: ValueType.INT,
  })

  const usageOnNonLeafTotal = meter.createCounter('agent_usage_recorded_on_non_leaf_total', {
    description: 'Usage tokens recorded on a non-leaf (orchestrator) span.',
    valueType: ValueType.INT,
  })

  const traceAuditJoinMissTotal = meter.createCounter('agent_trace_audit_join_miss_total', {
    description: 'Trace-to-audit join misses (trace present but no audit row).',
    valueType: ValueType.INT,
  })

  const leakCanaryTotal = meter.createCounter('agent_cross_tenant_leak_canary_total', {
    description: 'Cross-tenant leak canary scan results.',
    valueType: ValueType.INT,
  })

  const tenantTraceQuotaUsed = meter.createObservableGauge('agent_tenant_trace_quota_used', {
    description: 'Fraction of the daily trace quota consumed per tenant (0.0–1.0).',
    valueType: ValueType.DOUBLE,
  })

  meter.addBatchObservableCallback(
    (observableResult: BatchObservableResult) => {
      for (const [tenantId, fraction] of _tenantQuotaMap) {
        observableResult.observe(tenantTraceQuotaUsed, fraction, { tenant_id: tenantId })
      }
    },
    [tenantTraceQuotaUsed],
  )

  _instruments = {
    samplingDecisionTotal,
    piiRedactionTotal,
    usageOnNonLeafTotal,
    traceAuditJoinMissTotal,
    leakCanaryTotal,
    tenantTraceQuotaUsed,
  }

  return _instruments
}

// ─── Test-only reset ───────────────────────────────────────────────────────────

/**
 * @internal — test-only. Clears the cached instrument instances and the quota
 * Map so the next helper call re-acquires a fresh meter from the currently
 * registered provider. Must only be called from test setup/teardown.
 */
export function __INTERNAL_resetInstruments(): void {
  _instruments = undefined
  _tenantQuotaMap.clear()
}

// ─── Helper functions ──────────────────────────────────────────────────────────

/**
 * Records a turn sampling decision.
 * Increments `agent_sampling_decision_total{capture, reason}`.
 */
export function recordSamplingDecision(capture: boolean, reason: string): void {
  getInstruments().samplingDecisionTotal.add(1, { capture: String(capture), reason })
}

/**
 * Records a PII redaction event for a specific tool.
 * Increments `agent_pii_redaction_total{tool_name}`.
 */
export function recordPiiRedaction(toolName: string): void {
  getInstruments().piiRedactionTotal.add(1, { tool_name: toolName })
}

/**
 * Records a usage token event on a non-leaf (orchestrator) span.
 * Increments `agent_usage_recorded_on_non_leaf_total`.
 */
export function recordNonLeafUsageWarning(): void {
  getInstruments().usageOnNonLeafTotal.add(1)
}

/**
 * Records a trace-to-audit join miss.
 * Increments `agent_trace_audit_join_miss_total`.
 */
export function recordTraceAuditJoinMiss(): void {
  getInstruments().traceAuditJoinMissTotal.add(1)
}

/**
 * Records a leak canary scan result.
 * Increments `agent_cross_tenant_leak_canary_total{result}`.
 *
 * Values:
 *   'clean'        — scan ran and found no leak (requires a deployed trace backend).
 *   'leak_detected' — scan found a cross-tenant span; P0 incident; read plane disabled.
 *   'deferred'     — scan is formally deferred until the trace backend is deployed
 *                    (Plan 07 §1 out-of-scope). Emitting 'deferred' keeps the gap
 *                    visible in dashboards rather than silently reporting 'clean'.
 */
export function recordLeakCanary(result: 'clean' | 'leak_detected' | 'deferred'): void {
  getInstruments().leakCanaryTotal.add(1, { result })
}

/**
 * Updates the tenant trace quota gauge.
 * Sets `agent_tenant_trace_quota_used{tenant_id}` to `fraction` (0.0–1.0).
 * The value is picked up on the next metric collection cycle.
 */
export function setTenantTraceQuotaUsed(tenantId: string, fraction: number): void {
  _tenantQuotaMap.set(tenantId, fraction)
  // Ensure instruments (and the observable callback) are initialised.
  getInstruments()
}
