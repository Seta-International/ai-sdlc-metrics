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
 * ── Instruments ──────────────────────────────────────────────────
 *
 * agent_cost_usd_total{tenant_id, layer, model_id, pricing_id}           counter
 *   Records dollar cost per successful LLM call (R-05.6a: once per success only).
 *
 * agent_usage_tokens_total{tenant_id, model_id, kind}                    counter
 *   Tokens consumed per successful LLM call.
 *   kind ∈ {input_uncached, input_cached_read, input_cached_write, output, output_reasoning}.
 *   No user_id.
 *
 * agent_budget_remaining_usd{tenant_id}                                   observable gauge
 *   Snapshots remaining USD budget per tenant after each cost deduction.
 *
 * agent_budget_user_remaining_usd{tenant_id}                              observable gauge
 *   Aggregated per-user remaining budget, reported per tenant (no user_id label per R-05.30).
 *   Updated alongside agent_budget_remaining_usd by BudgetChecker / CostRecorder.
 *
 * agent_tier_shift_total{tenant_id, from_tier, to_tier, reason}           counter
 *   Policy-driven tier downgrades. reason ∈ {budget, quality_canary}.
 *
 * agent_provider_fallback_total{tenant_id, model_id, error_class}         counter
 *   Error-recovery fallbacks. error_class per VendorError taxonomy.
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
 *   Adapter-field drops. P1 alert on any non-zero value.
 *   No tenant_id — adapter-level signal, not tenant-attributed.
 *
 * agent_approval_inbox_depth{tenant_id}                                   observable gauge
 *   Approver-aggregate pending draft count (no user_id label per R-05.30).
 *
 * agent_budget_refill_total{tenant_id, source}                            counter
 *   Budget refill events. source ∈ {midnight, admin_topup}.
 *
 * agent_ladder_step_total{tenant_id, step, trace_tag}                     counter
 *   Per-degradation-step occurrences. step ∈ 1..7.
 *   trace_tag ∈ {provider_retry, provider_fallback, provider_outage, tier_shift, refused}.
 *
 * agent_ladder_transition_latency_ms{step}                                histogram
 *   Time to execute a ladder step transition. step ∈ 1..7.
 *   Emitted by GracefulDegradationLadder.evaluate() around each step dispatch.
 *   No tenant_id — ladder-evaluation is CPU-bound; per-step timing is the signal.
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

interface CostInstruments {
  /** agent_cost_usd_total{tenant_id, layer, model_id, pricing_id} */
  costUsdTotal: Counter
  /** agent_usage_tokens_total{tenant_id, model_id, kind} */
  usageTokensTotal: Counter
  /** agent_budget_remaining_usd{tenant_id} — observable gauge */
  budgetRemainingUsd: ObservableGauge
  /** agent_budget_user_remaining_usd{tenant_id} — observable gauge (aggregated; no user_id) */
  budgetUserRemainingUsd: ObservableGauge
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
  /** agent_ladder_transition_latency_ms{step} — histogram */
  ladderTransitionLatencyMs: Histogram
}

/** Per-tenant remaining USD budget (0 or positive). Updated by setBudgetRemaining. */
const _budgetRemainingMap = new Map<string, number>()

/** Per-tenant aggregated user remaining USD budget. Updated by setBudgetUserRemaining. */
const _budgetUserRemainingMap = new Map<string, number>()

/** Per-tenant approval inbox depth. Updated by setApprovalInboxDepth. */
const _approvalInboxDepthMap = new Map<string, number>()

let _instruments: CostInstruments | undefined

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

  const usageTokensTotal = meter.createCounter('agent_usage_tokens_total', {
    description:
      'Tokens consumed per successful LLM call. ' +
      'kind ∈ {input_uncached, input_cached_read, input_cached_write, output, output_reasoning}. ' +
      'Incremented once per success alongside agent_cost_usd_total. ' +
      'No user_id label.',
    valueType: ValueType.INT,
  })

  const budgetRemainingUsd = meter.createObservableGauge('agent_budget_remaining_usd', {
    description:
      'Remaining daily USD budget per tenant, snapshotted after each cost deduction. ' +
      'No user_id label.',
    unit: 'USD',
    valueType: ValueType.DOUBLE,
  })

  const budgetUserRemainingUsd = meter.createObservableGauge('agent_budget_user_remaining_usd', {
    description:
      'Aggregated per-user remaining USD budget, reported per tenant. ' +
      'No user_id label — aggregated at tenant level to avoid cardinality explosion. ' +
      'Updated alongside agent_budget_remaining_usd by BudgetChecker after each cost deduction.',
    unit: 'USD',
    valueType: ValueType.DOUBLE,
  })

  const tierShiftTotal = meter.createCounter('agent_tier_shift_total', {
    description:
      'Policy-driven tier downgrades. ' +
      'reason ∈ {budget, quality_canary}. ' +
      'Distinct from provider_fallback.',
    valueType: ValueType.INT,
  })

  const providerFallbackTotal = meter.createCounter('agent_provider_fallback_total', {
    description:
      'Error-recovery-driven provider fallbacks. ' +
      'error_class ∈ {vendor_rate_limit, vendor_overload, vendor_server_error, vendor_timeout, vendor_invalid_response}.',
    valueType: ValueType.INT,
  })

  const llmCallAttemptDurationMs = meter.createHistogram('agent_llm_call_attempt_duration_ms', {
    description:
      'Duration of the terminal successful LLM call attempt only. ' +
      'Latency SLO source. Does not include retry overhead.',
    unit: 'ms',
    valueType: ValueType.DOUBLE,
  })

  const llmCallTotalDurationMs = meter.createHistogram('agent_llm_call_total_duration_ms', {
    description:
      'Total wall-time across all LLM call attempts including retries. ' +
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
      'No user_id label.',
    valueType: ValueType.INT,
  })

  const adapterDropTotal = meter.createCounter('agent_adapter_drop_total', {
    description:
      'Adapter-field drops. ' +
      'P1 alert on any non-zero value. ' +
      'No tenant_id — adapter-level signal, cardinality is bounded by (adapter × field).',
    valueType: ValueType.INT,
  })

  const approvalInboxDepth = meter.createObservableGauge('agent_approval_inbox_depth', {
    description: 'Approver-aggregate pending draft count per tenant. ' + 'No user_id label.',
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
      'Per-degradation-step occurrences for the 7-step graceful degradation ladder. ' +
      'step ∈ 1..7. ' +
      'trace_tag ∈ {provider_retry, provider_fallback, provider_outage, tier_shift, refused}.',
    valueType: ValueType.INT,
  })

  const ladderTransitionLatencyMs = meter.createHistogram('agent_ladder_transition_latency_ms', {
    description:
      'Time to execute a graceful-degradation ladder step transition. ' +
      'step ∈ 1..7. No tenant_id — ladder evaluation is CPU-bound; per-step timing is the signal.',
    unit: 'ms',
    valueType: ValueType.DOUBLE,
  })

  meter.addBatchObservableCallback(
    (result: BatchObservableResult) => {
      for (const [tenantId, remaining] of _budgetRemainingMap) {
        result.observe(budgetRemainingUsd, remaining, { tenant_id: tenantId })
      }
      for (const [tenantId, remaining] of _budgetUserRemainingMap) {
        result.observe(budgetUserRemainingUsd, remaining, { tenant_id: tenantId })
      }
      for (const [tenantId, depth] of _approvalInboxDepthMap) {
        result.observe(approvalInboxDepth, depth, { tenant_id: tenantId })
      }
    },
    [budgetRemainingUsd, budgetUserRemainingUsd, approvalInboxDepth],
  )

  _instruments = {
    costUsdTotal,
    usageTokensTotal,
    budgetRemainingUsd,
    budgetUserRemainingUsd,
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
    ladderTransitionLatencyMs,
  }

  return _instruments
}

/**
 * @internal — test-only. Clears the cached instrument instances and the gauge
 * backing maps so the next helper call re-acquires a fresh meter from the
 * currently registered provider. Must only be called from test setup/teardown.
 */
export function __INTERNAL_resetInstruments(): void {
  _instruments = undefined
  _budgetRemainingMap.clear()
  _budgetUserRemainingMap.clear()
  _approvalInboxDepthMap.clear()
}

/**
 * Record dollar cost for a successful LLM call.
 * Call once per success — never per retry attempt.
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
 * Record token counts for a successful LLM call.
 * Call once per success alongside recordCostUsd — never per retry attempt.
 *
 * Labels: tenant_id, model_id, kind.
 * kind ∈ 'input_uncached' | 'input_cached_read' | 'input_cached_write' | 'output' | 'output_reasoning'.
 * No user_id.
 */
export function recordUsageTokens(
  tenantId: string,
  modelId: string,
  kind:
    | 'input_uncached'
    | 'input_cached_read'
    | 'input_cached_write'
    | 'output'
    | 'output_reasoning',
  count: number,
): void {
  getInstruments().usageTokensTotal.add(count, {
    tenant_id: tenantId,
    model_id: modelId,
    kind,
  })
}

/**
 * Update the remaining budget gauge for a tenant.
 * Call after each cost deduction or after a budget refill.
 *
 * Labels: tenant_id. No user_id.
 * unit: USD.
 */
export function setBudgetRemaining(tenantId: string, remainingUsd: number): void {
  _budgetRemainingMap.set(tenantId, remainingUsd)
  // Ensure instruments (and the observable callback) are initialised.
  getInstruments()
}

/**
 * Update the per-user remaining budget gauge for a tenant.
 * Aggregated at tenant level — no user_id label (R-05.30 cardinality guardrail).
 * Call alongside setBudgetRemaining after each cost deduction / budget refill.
 *
 * Labels: tenant_id. No user_id.
 * unit: USD.
 */
export function setBudgetUserRemaining(tenantId: string, remainingUsd: number): void {
  _budgetUserRemainingMap.set(tenantId, remainingUsd)
  // Ensure instruments (and the observable callback) are initialised.
  getInstruments()
}

/**
 * Record a policy-driven tier shift.
 * Distinct from provider_fallback — conflation is a CI-caught bug.
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
 * Record an error-recovery provider fallback.
 * Triggered by consecutive-same-error ≥3. Sticky for the turn.
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
 * Record the duration of the terminal successful LLM call attempt.
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
 * Record the total wall-time for an LLM call including all retry attempts.
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
 * Record an internal vendor retry.
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
 * Record a rate-limit rejection.
 * Call when RateLimiter.check returns { allowed: false }.
 *
 * Labels: tenant_id, limit_key. No user_id.
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
 * Record an adapter field drop.
 * P1 alert must fire on any non-zero value.
 * Call when UsageExtractor.detectDroppedFields returns a non-empty list.
 *
 * Labels: adapter, field. No tenant_id (adapter-level signal — cardinality bounded).
 */
export function recordAdapterDrop(adapter: string, field: string): void {
  getInstruments().adapterDropTotal.add(1, { adapter, field })
}

/**
 * Update the approval inbox depth gauge for a tenant.
 * Call after each checkEligibility to reflect the current approver-aggregate count.
 *
 * Labels: tenant_id. No user_id.
 */
export function setApprovalInboxDepth(tenantId: string, depth: number): void {
  _approvalInboxDepthMap.set(tenantId, depth)
  // Ensure instruments (and the observable callback) are initialised.
  getInstruments()
}

/**
 * Record a budget refill event.
 * Call on midnight refill or admin top-up (both must emit kernel audit separately).
 *
 * Labels: tenant_id, source. source ∈ 'midnight' | 'admin_topup'.
 */
export function recordBudgetRefill(tenantId: string, source: 'midnight' | 'admin_topup'): void {
  getInstruments().budgetRefillTotal.add(1, { tenant_id: tenantId, source })
}

/**
 * Record a graceful-degradation ladder step occurrence.
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

/**
 * Record the latency of a graceful-degradation ladder step transition.
 * Called by GracefulDegradationLadder.evaluate() wrapping each step dispatch.
 * No tenant_id — per-step CPU timing is the signal; tenant attribution is on ladderStepTotal.
 *
 * Labels: step (1..7).
 * unit: ms.
 */
export function recordLadderTransitionLatency(
  step: 1 | 2 | 3 | 4 | 5 | 6 | 7,
  latencyMs: number,
): void {
  getInstruments().ladderTransitionLatencyMs.record(latencyMs, { step })
}
