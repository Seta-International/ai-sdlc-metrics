/**
 * Cost / budget / rate-limit metrics for Plan 05 §8.
 *
 * Instruments are initialised lazily on first use via `getInstruments()`.
 * This ensures the global MeterProvider is already registered by the time
 * metrics are first recorded — in production the SDK is started before any
 * request is handled; in tests the spec file sets `metrics.setGlobalMeterProvider`
 * before calling the helper functions.
 *
 * For background on the lazy-init pattern, see gateway-metrics.ts.
 *
 * ── Instruments (Plan 05 §8) ──────────────────────────────────────────────────
 *
 * agent_cost_usd_total{tenant_id, layer, model_id, pricing_id}           counter
 *   Records dollar cost per successful LLM call (R-05.6a: once per success only).
 *
 * agent_budget_remaining_usd{tenant_id}                                   observable gauge
 *   Snapshots remaining USD budget per tenant after each cost deduction.
 *
 * agent_tier_shift_total{tenant_id, from_tier, to_tier, reason}           counter
 *   Policy-driven tier downgrades (R-05.19). reason ∈ {budget, quality_canary}.
 *
 * agent_provider_fallback_total{tenant_id, model_id, error_class}         counter
 *   Error-recovery fallbacks (R-05.20). error_class per VendorError taxonomy.
 *
 * agent_llm_call_attempt_duration_ms{tenant_id, model_id, layer}          histogram
 *   Duration of the terminal successful attempt only (R-05.6b latency SLO source).
 *
 * agent_llm_call_total_duration_ms{tenant_id, model_id, layer}            histogram
 *   Total duration across all attempts (R-05.6b reliability analysis source).
 *
 * agent_vendor_retry_total{tenant_id, model_id, error_class}              counter
 *   Internal vendor retries before success (R-05.6a / R-05.20b). Zero cost impact.
 *
 * agent_rate_limit_rejected_total{tenant_id, limit_key}                   counter
 *   Rate-limit rejections per tenant. limit_key ∈ {queries/user/min,
 *   l3_writes/user/day, schedule_creations/user/day}.
 *
 * agent_adapter_drop_total{adapter, field}                                counter
 *   Adapter-field drops (R-05.5). P1 alert on any non-zero value.
 *   No tenant_id — adapter-level signal, not tenant-attributed.
 *
 * agent_approval_inbox_depth{tenant_id}                                   observable gauge
 *   Approver-aggregate pending draft count (no user_id label per R-05.30).
 *
 * agent_budget_refill_total{tenant_id, source}                            counter
 *   Budget refill events. source ∈ {midnight, admin_topup}.
 *
 * agent_ladder_step_total{tenant_id, step, trace_tag}                     counter
 *   Per-degradation-step occurrences (Plan 05 §8). step ∈ 1..7.
 *   trace_tag ∈ {provider_retry, provider_fallback, provider_outage, tier_shift, refused}.
 *
 * ── Label cardinality guardrail (R-05.30 / R-05.31) ─────────────────────────
 *
 * BLOCKED_LABELS = [user_id, conversation_id, trace_id, delegation_id, schedule_id]
 * None of the above labels appear on any instrument defined here.
 */

import {
  metrics,
  ValueType,
  type Counter,
  type Histogram,
  type ObservableGauge,
  type BatchObservableResult,
} from '@opentelemetry/api'

// ─── Instrument interface ─────────────────────────────────────────────────────

interface CostInstruments {
  /** agent_cost_usd_total{tenant_id, layer, model_id, pricing_id} */
  costUsdTotal: Counter
  /** agent_budget_remaining_usd{tenant_id} — observable gauge */
  budgetRemainingUsd: ObservableGauge
  /** agent_tier_shift_total{tenant_id, from_tier, to_tier, reason} */
  tierShiftTotal: Counter
  /** agent_provider_fallback_total{tenant_id, model_id, error_class} */
  providerFallbackTotal: Counter
  /** agent_llm_call_attempt_duration_ms{tenant_id, model_id, layer} */
  llmCallAttemptDurationMs: Histogram
  /** agent_llm_call_total_duration_ms{tenant_id, model_id, layer} */
  llmCallTotalDurationMs: Histogram
  /** agent_vendor_retry_total{tenant_id, model_id, error_class} */
  vendorRetryTotal: Counter
  /** agent_rate_limit_rejected_total{tenant_id, limit_key} */
  rateLimitRejectedTotal: Counter
  /** agent_adapter_drop_total{adapter, field} */
  adapterDropTotal: Counter
  /** agent_approval_inbox_depth{tenant_id} — observable gauge */
  approvalInboxDepth: ObservableGauge
  /** agent_budget_refill_total{tenant_id, source} */
  budgetRefillTotal: Counter
  /** agent_ladder_step_total{tenant_id, step, trace_tag} */
  ladderStepTotal: Counter
}

// ─── Module-level state ───────────────────────────────────────────────────────

/** Per-tenant remaining USD budget (0 or positive). Updated by setBudgetRemaining. */
const _budgetRemainingMap = new Map<string, number>()

/** Per-tenant approval inbox depth. Updated by setApprovalInboxDepth. */
const _approvalInboxDepthMap = new Map<string, number>()

let _instruments: CostInstruments | undefined

// ─── Lazy instrument cache ────────────────────────────────────────────────────

function getInstruments(): CostInstruments {
  if (_instruments) return _instruments

  const meter = metrics.getMeter('agents.cost')

  const costUsdTotal = meter.createCounter('agent_cost_usd_total', {
    description:
      'Dollar cost per successful LLM call, labelled by tenant, layer, model, and pricing version. ' +
      'Incremented once per success (R-05.6a — never per retry attempt).',
    unit: 'USD',
    valueType: ValueType.DOUBLE,
  })

  const budgetRemainingUsd = meter.createObservableGauge('agent_budget_remaining_usd', {
    description:
      'Remaining daily USD budget per tenant, snapshotted after each cost deduction. ' +
      'No user_id label (R-05.30).',
    unit: 'USD',
    valueType: ValueType.DOUBLE,
  })

  const tierShiftTotal = meter.createCounter('agent_tier_shift_total', {
    description:
      'Policy-driven tier downgrades (R-05.19). ' +
      'reason ∈ {budget, quality_canary}. ' +
      'Distinct from provider_fallback (R-05.21).',
    valueType: ValueType.INT,
  })

  const providerFallbackTotal = meter.createCounter('agent_provider_fallback_total', {
    description:
      'Error-recovery-driven provider fallbacks (R-05.20). ' +
      'error_class ∈ {vendor_rate_limit, vendor_overload, vendor_server_error, vendor_timeout, vendor_invalid_response}.',
    valueType: ValueType.INT,
  })

  const llmCallAttemptDurationMs = meter.createHistogram('agent_llm_call_attempt_duration_ms', {
    description:
      'Duration of the terminal successful LLM call attempt only (R-05.6b). ' +
      'Latency SLO source. Does not include retry overhead.',
    unit: 'ms',
    valueType: ValueType.DOUBLE,
  })

  const llmCallTotalDurationMs = meter.createHistogram('agent_llm_call_total_duration_ms', {
    description:
      'Total wall-time across all LLM call attempts including retries (R-05.6b). ' +
      'Reliability analysis source. Gap between this and attempt_duration quantifies retry overhead.',
    unit: 'ms',
    valueType: ValueType.DOUBLE,
  })

  const vendorRetryTotal = meter.createCounter('agent_vendor_retry_total', {
    description:
      'Internal vendor retries before a successful response (R-05.6a / R-05.20b). ' +
      'Zero cost impact — never incremented for the successful attempt.',
    valueType: ValueType.INT,
  })

  const rateLimitRejectedTotal = meter.createCounter('agent_rate_limit_rejected_total', {
    description:
      'Rate-limit rejections per tenant and limit key (R-05.23–R-05.26). ' +
      'limit_key ∈ {queries/user/min, l3_writes/user/day, schedule_creations/user/day}. ' +
      'No user_id label (R-05.30).',
    valueType: ValueType.INT,
  })

  const adapterDropTotal = meter.createCounter('agent_adapter_drop_total', {
    description:
      'Adapter-field drops (R-05.5). ' +
      'P1 alert on any non-zero value. ' +
      'No tenant_id — adapter-level signal, cardinality is bounded by (adapter × field).',
    valueType: ValueType.INT,
  })

  const approvalInboxDepth = meter.createObservableGauge('agent_approval_inbox_depth', {
    description:
      'Approver-aggregate pending draft count per tenant (Plan 05 §8). ' +
      'No user_id label (R-05.30).',
    valueType: ValueType.INT,
  })

  const budgetRefillTotal = meter.createCounter('agent_budget_refill_total', {
    description:
      'Budget refill events per tenant and source. ' +
      'source ∈ {midnight, admin_topup} (R-05.33–R-05.34).',
    valueType: ValueType.INT,
  })

  const ladderStepTotal = meter.createCounter('agent_ladder_step_total', {
    description:
      'Per-degradation-step occurrences for the 7-step graceful degradation ladder (Plan 05 §8). ' +
      'step ∈ 1..7. ' +
      'trace_tag ∈ {provider_retry, provider_fallback, provider_outage, tier_shift, refused}.',
    valueType: ValueType.INT,
  })

  meter.addBatchObservableCallback(
    (result: BatchObservableResult) => {
      for (const [tenantId, remaining] of _budgetRemainingMap) {
        result.observe(budgetRemainingUsd, remaining, { tenant_id: tenantId })
      }
      for (const [tenantId, depth] of _approvalInboxDepthMap) {
        result.observe(approvalInboxDepth, depth, { tenant_id: tenantId })
      }
    },
    [budgetRemainingUsd, approvalInboxDepth],
  )

  _instruments = {
    costUsdTotal,
    budgetRemainingUsd,
    tierShiftTotal,
    providerFallbackTotal,
    llmCallAttemptDurationMs,
    llmCallTotalDurationMs,
    vendorRetryTotal,
    rateLimitRejectedTotal,
    adapterDropTotal,
    approvalInboxDepth,
    budgetRefillTotal,
    ladderStepTotal,
  }

  return _instruments
}

// ─── Test-only reset ──────────────────────────────────────────────────────────

/**
 * @internal — test-only. Clears the cached instrument instances and the gauge
 * backing maps so the next helper call re-acquires a fresh meter from the
 * currently registered provider. Must only be called from test setup/teardown.
 */
export function __INTERNAL_resetInstruments(): void {
  _instruments = undefined
  _budgetRemainingMap.clear()
  _approvalInboxDepthMap.clear()
}

// ─── Helper functions ─────────────────────────────────────────────────────────

/**
 * Record dollar cost for a successful LLM call (Plan 05 §8).
 * Call once per success — never per retry attempt (R-05.6a).
 *
 * Labels: tenant_id, layer, model_id, pricing_id.
 * unit: USD.
 */
export function recordCostUsd(
  tenantId: string,
  layer: string,
  modelId: string,
  pricingId: string,
  costUsd: number,
): void {
  getInstruments().costUsdTotal.add(costUsd, {
    tenant_id: tenantId,
    layer,
    model_id: modelId,
    pricing_id: pricingId,
  })
}

/**
 * Update the remaining budget gauge for a tenant (Plan 05 §8).
 * Call after each cost deduction or after a budget refill.
 *
 * Labels: tenant_id. No user_id (R-05.30).
 * unit: USD.
 */
export function setBudgetRemaining(tenantId: string, remainingUsd: number): void {
  _budgetRemainingMap.set(tenantId, remainingUsd)
  // Ensure instruments (and the observable callback) are initialised.
  getInstruments()
}

/**
 * Record a policy-driven tier shift (Plan 05 §8, R-05.19).
 * Distinct from provider_fallback (R-05.21) — conflation is a CI-caught bug.
 *
 * Labels: tenant_id, from_tier, to_tier, reason.
 * reason ∈ 'budget' | 'quality_canary'.
 */
export function recordTierShift(
  tenantId: string,
  fromTier: 'full' | 'nano',
  toTier: 'nano' | 'refused',
  reason: 'budget' | 'quality_canary',
): void {
  getInstruments().tierShiftTotal.add(1, {
    tenant_id: tenantId,
    from_tier: fromTier,
    to_tier: toTier,
    reason,
  })
}

/**
 * Record an error-recovery provider fallback (Plan 05 §8, R-05.20).
 * Triggered by consecutive-same-error ≥3 (R-05.20c). Sticky for the turn.
 *
 * Labels: tenant_id, model_id, error_class.
 * error_class ∈ VendorError['class'] per R-05.20a.
 */
export function recordProviderFallback(
  tenantId: string,
  modelId: string,
  errorClass:
    | 'vendor_rate_limit'
    | 'vendor_overload'
    | 'vendor_server_error'
    | 'vendor_timeout'
    | 'vendor_invalid_response',
): void {
  getInstruments().providerFallbackTotal.add(1, {
    tenant_id: tenantId,
    model_id: modelId,
    error_class: errorClass,
  })
}

/**
 * Record the duration of the terminal successful LLM call attempt (Plan 05 §8, R-05.6b).
 * Latency SLO source. Does NOT include time spent on failed retries.
 *
 * Labels: tenant_id, model_id, layer.
 * unit: ms.
 */
export function recordLlmCallAttemptDuration(
  tenantId: string,
  modelId: string,
  layer: string,
  durationMs: number,
): void {
  getInstruments().llmCallAttemptDurationMs.record(durationMs, {
    tenant_id: tenantId,
    model_id: modelId,
    layer,
  })
}

/**
 * Record the total wall-time for an LLM call including all retry attempts (Plan 05 §8, R-05.6b).
 * Reliability analysis source. Gap between this and attempt_duration quantifies retry overhead.
 *
 * Labels: tenant_id, model_id, layer.
 * unit: ms.
 */
export function recordLlmCallTotalDuration(
  tenantId: string,
  modelId: string,
  layer: string,
  durationMs: number,
): void {
  getInstruments().llmCallTotalDurationMs.record(durationMs, {
    tenant_id: tenantId,
    model_id: modelId,
    layer,
  })
}

/**
 * Record an internal vendor retry (Plan 05 §8, R-05.6a, R-05.20b).
 * Incremented once per failed attempt before the eventual success.
 * Zero cost impact — failed attempts never drive CostRecorder.record.
 *
 * Labels: tenant_id, model_id, error_class.
 */
export function recordVendorRetry(
  tenantId: string,
  modelId: string,
  errorClass:
    | 'vendor_rate_limit'
    | 'vendor_overload'
    | 'vendor_server_error'
    | 'vendor_timeout'
    | 'vendor_invalid_response',
): void {
  getInstruments().vendorRetryTotal.add(1, {
    tenant_id: tenantId,
    model_id: modelId,
    error_class: errorClass,
  })
}

/**
 * Record a rate-limit rejection (Plan 05 §8, R-05.23–R-05.26).
 * Call when RateLimiter.check returns { allowed: false }.
 *
 * Labels: tenant_id, limit_key. No user_id (R-05.30).
 */
export function recordRateLimitRejected(
  tenantId: string,
  limitKey: 'queries/user/min' | 'l3_writes/user/day' | 'schedule_creations/user/day',
): void {
  getInstruments().rateLimitRejectedTotal.add(1, {
    tenant_id: tenantId,
    limit_key: limitKey,
  })
}

/**
 * Record an adapter field drop (Plan 05 §8, R-05.5).
 * P1 alert must fire on any non-zero value.
 * Call when UsageExtractor.detectDroppedFields returns a non-empty list.
 *
 * Labels: adapter, field. No tenant_id (adapter-level signal — cardinality bounded).
 */
export function recordAdapterDrop(adapter: string, field: string): void {
  getInstruments().adapterDropTotal.add(1, { adapter, field })
}

/**
 * Update the approval inbox depth gauge for a tenant (Plan 05 §8).
 * Call after each checkEligibility to reflect the current approver-aggregate count.
 *
 * Labels: tenant_id. No user_id (R-05.30).
 */
export function setApprovalInboxDepth(tenantId: string, depth: number): void {
  _approvalInboxDepthMap.set(tenantId, depth)
  // Ensure instruments (and the observable callback) are initialised.
  getInstruments()
}

/**
 * Record a budget refill event (Plan 05 §8, R-05.33–R-05.34).
 * Call on midnight refill or admin top-up (both must emit kernel audit separately).
 *
 * Labels: tenant_id, source. source ∈ 'midnight' | 'admin_topup'.
 */
export function recordBudgetRefill(tenantId: string, source: 'midnight' | 'admin_topup'): void {
  getInstruments().budgetRefillTotal.add(1, { tenant_id: tenantId, source })
}

/**
 * Record a graceful-degradation ladder step occurrence (Plan 05 §8).
 * Call on every GracefulDegradationLadder.evaluate transition.
 *
 * Labels: tenant_id, step (1..7), trace_tag.
 * trace_tag ∈ 'provider_retry' | 'provider_fallback' | 'provider_outage' | 'tier_shift' | 'refused'.
 */
export function recordLadderStep(
  tenantId: string,
  step: 1 | 2 | 3 | 4 | 5 | 6 | 7,
  traceTag: 'provider_retry' | 'provider_fallback' | 'provider_outage' | 'tier_shift' | 'refused',
): void {
  getInstruments().ladderStepTotal.add(1, {
    tenant_id: tenantId,
    step,
    trace_tag: traceTag,
  })
}
