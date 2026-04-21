/**
 * Gateway metrics for the ToolGateway pipeline (plan 01, Task 6).
 *
 * Instruments are initialised lazily on first use via `getInstruments()`.
 * This ensures the global MeterProvider is already registered by the time
 * metrics are first recorded — in production the SDK is started before any
 * request is handled; in tests the spec file sets `metrics.setGlobalMeterProvider`
 * before calling the helper functions.
 *
 * Background: unlike the Tracer API (which returns a `ProxyTracer`), the Metrics
 * API returns a concrete `NoopMeter` when no provider is registered. Instruments
 * created from a `NoopMeter` remain no-ops permanently even after a real provider
 * is registered later. Lazy initialisation sidesteps this limitation.
 *
 * ── Label discipline (R-05.30 / R-05.31) ──────────────────────────────────
 *
 * `agent_tool_call_total`        — labels: tenant_id, tool_name, result_status
 * `agent_tool_tripwire_total`    — labels: tenant_id, variant, disposition
 * `agent_gateway_step_duration_ms` — label: step ONLY
 *   Rationale for no tenant_id on step duration: step latency is an
 *   infrastructure signal; adding tenant_id would multiply label cardinality by
 *   the number of tenants (potentially thousands) with no meaningful per-tenant
 *   SLO on gateway internals. Tenant-level latency attribution lives in the
 *   call-total counter and trace spans.
 *
 * ── Cache hit ratio — design decision ─────────────────────────────────────
 *
 * Plan §8 specifies `agent_tool_cache_hit_ratio{tenant_id, sub_agent_key}` as a
 * gauge. Gauges do not naturally compute ratios. Instead we emit:
 *
 *   `agent_tool_cache_lookup_total{tenant_id, tool_name, outcome}`
 *   where outcome ∈ 'hit' | 'miss' | 'coalesced'
 *
 * Ratios (hit / (hit + miss + coalesced)) are computed in the dashboard layer
 * via PromQL / OTTL. This is idiomatic in Prometheus-style observability.
 *
 * `sub_agent_key` from the plan spec is dropped as a metric label because it is
 * a free-form string (set by each sub-agent registration) that can grow without
 * bound and multiply cardinality per tenant. Per-sub-agent breakdown is better
 * served via trace spans which carry `sub_agent_key` as a span attribute.
 */

import { metrics, ValueType, type Counter, type Histogram } from '@opentelemetry/api'

// ─── Lazy instrument cache ────────────────────────────────────────────────────

interface GatewayInstruments {
  callTotal: Counter
  tripwireTotal: Counter
  cacheLookupTotal: Counter
  stepDurationMs: Histogram
  /**
   * Counts sub-agents hidden during resolveForSession due to module toggles or
   * role permission filtering (Plan 02 §8, R-02.9a).
   * Labels: tenant_id, reason.
   * reason ∈ 'module_disabled' | 'permission_empty_scope'
   *
   * `sub_agent_key` is intentionally omitted — it is a free-form string that
   * grows without bound and multiplies cardinality per tenant. Per-sub-agent
   * detail lives on span attributes (agent.router.sub_agent_hidden_by_module,
   * agent.router.sub_agent_hidden_by_permission).
   */
  subAgentHiddenTotal: Counter
  /**
   * Counts permission narrative cache lookups by outcome.
   * Labels: tenant_id, outcome.
   * outcome ∈ 'hit' | 'miss'
   *
   * Plan §8 specifies agent_narrative_cache_hit_ratio as a gauge, but OTel
   * semantics favour two counters (hit + miss) with the ratio computed in
   * the dashboard via PromQL / OTTL. This is R-02.17..R-02.19.
   */
  narrativeCacheTotal: Counter
  /**
   * Counts router turn decisions by outcome (Plan 02 §8).
   * Labels: tenant_id, outcome.
   * outcome ∈ 'bounded_plan' | 'disambiguation' | 'parse_escalated'
   *
   * 3 outcomes — bounded cardinality regardless of tenant count.
   */
  routerDecisionsTotal: Counter
  /**
   * Counts router parse retries (Plan 02 §8, R-02.23a).
   * Labels: tenant_id.
   * Incremented once per turn that requires a second LLM call.
   */
  routerParseRetryTotal: Counter
  /**
   * Counts sub-agent invocations emitted per turn (Plan 02 §8, R-02.23a).
   * Labels: tenant_id, sub_agent_key, phase.
   *
   * DEVIATION from general cardinality discipline (T5):
   *   `sub_agent_key` IS a label here because Plan §8 explicitly spec's it:
   *   "agent_sub_agent_invoked_total{tenant_id, sub_agent_key, phase}".
   *   Unlike tool_name (free-form), sub_agent_key is a registry-boot-time
   *   constant — cardinality is bounded by the number of registered sub-agents
   *   (low double digits at most). This is a documented exception.
   */
  subAgentInvokedTotal: Counter
}

let _instruments: GatewayInstruments | undefined

/**
 * Returns the instruments, initialising them on first call.
 *
 * We defer creation until the first helper call so the global MeterProvider is
 * already registered. In production that is always true (SDK starts before
 * NestJS boots). In tests the spec registers the provider before exercising the
 * helpers.
 */
function getInstruments(): GatewayInstruments {
  if (_instruments) return _instruments

  const meter = metrics.getMeter('agents.gateway')

  _instruments = {
    /**
     * Counts every terminal tool call (ok or tripwire).
     * Labels: tenant_id, tool_name, result_status.
     */
    callTotal: meter.createCounter('agent_tool_call_total', {
      description: 'Agent tool-call count, labelled by tenant, tool, and terminal result status.',
      valueType: ValueType.INT,
    }),

    /**
     * Counts every tripwire event with classification details.
     * Labels: tenant_id, variant, disposition.
     */
    tripwireTotal: meter.createCounter('agent_tool_tripwire_total', {
      description: 'Tripwire events by variant + disposition.',
      valueType: ValueType.INT,
    }),

    /**
     * Counts cache lookups by outcome to enable hit-ratio computation downstream.
     * Labels: tenant_id, tool_name, outcome.
     *
     * See module-level doc comment for the rationale behind using a counter
     * instead of a gauge, and for dropping sub_agent_key.
     */
    cacheLookupTotal: meter.createCounter('agent_tool_cache_lookup_total', {
      description: 'Cache lookup outcomes (hit/miss/coalesced) per tenant and tool.',
      valueType: ValueType.INT,
    }),

    /**
     * Per-step gateway wall-time in milliseconds.
     * Label: step ONLY (no tenant_id — see label discipline note above).
     */
    stepDurationMs: meter.createHistogram('agent_gateway_step_duration_ms', {
      description: 'Per-step gateway duration in ms.',
      unit: 'ms',
      valueType: ValueType.DOUBLE,
    }),

    /**
     * Counts sub-agents hidden during resolveForSession due to module toggles or
     * role permission filtering (Plan 02 §8, R-02.9a).
     * Labels: tenant_id, reason.
     */
    subAgentHiddenTotal: meter.createCounter('agent_sub_agent_hidden_total', {
      description:
        'Sub-agents hidden from a session due to module toggle or empty permission scope.',
      valueType: ValueType.INT,
    }),

    /**
     * Counts permission narrative cache lookups by outcome (Plan 02 §8, R-02.17..R-02.19).
     * Labels: tenant_id, outcome.
     */
    narrativeCacheTotal: meter.createCounter('agent_narrative_cache_total', {
      description: 'Permission narrative cache outcomes (hit/miss) per tenant.',
      valueType: ValueType.INT,
    }),

    /**
     * Counts router turn decisions by outcome (Plan 02 §8).
     * Labels: tenant_id, outcome.
     * outcome ∈ 'bounded_plan' | 'disambiguation' | 'parse_escalated'
     */
    routerDecisionsTotal: meter.createCounter('agent_router_decisions_total', {
      description: 'Router turn decision outcomes per tenant.',
      valueType: ValueType.INT,
    }),

    /**
     * Counts router parse retries (Plan 02 §8, R-02.23a).
     * Labels: tenant_id.
     */
    routerParseRetryTotal: meter.createCounter('agent_router_parse_retry_total', {
      description: 'Router parse retries (second LLM call) per tenant.',
      valueType: ValueType.INT,
    }),

    /**
     * Counts sub-agent invocations emitted per turn (Plan 02 §8, R-02.23a).
     * Labels: tenant_id, sub_agent_key, phase.
     *
     * DEVIATION from general cardinality discipline (T5):
     *   `sub_agent_key` IS a label here because Plan §8 explicitly spec's it.
     *   Cardinality is bounded by the number of registered sub-agents (low double digits).
     */
    subAgentInvokedTotal: meter.createCounter('agent_sub_agent_invoked_total', {
      description: 'Sub-agent invocation events per tenant, key, and phase.',
      valueType: ValueType.INT,
    }),
  }

  return _instruments
}

// ─── Test-only reset ──────────────────────────────────────────────────────────
// DO NOT import __INTERNAL_resetInstruments outside of test files.
// This hook exists solely for test teardown when the MeterProvider is replaced
// between test suites. Calling it in production code will silently drop metrics.

/**
 * @internal — test-only. Clears the cached instrument instances so the next
 * helper call re-acquires a fresh meter from the currently registered provider.
 * Must only be called from test setup/teardown (e.g. `beforeEach` in spec files).
 */
export function __INTERNAL_resetInstruments(): void {
  _instruments = undefined
}

// ─── Helper functions ─────────────────────────────────────────────────────────

/**
 * Record a terminal tool-call event.
 * Called once per `invoke()` attempt that reaches a terminal state (ok or tripwire).
 */
export function recordToolCall(tenantId: string, toolName: string, resultStatus: string): void {
  getInstruments().callTotal.add(1, {
    tenant_id: tenantId,
    tool_name: toolName,
    result_status: resultStatus,
  })
}

/**
 * Record a tripwire event with its classification labels.
 */
export function recordTripwire(tenantId: string, variant: string, disposition: string): void {
  getInstruments().tripwireTotal.add(1, { tenant_id: tenantId, variant, disposition })
}

/**
 * Record step wall-time. Label is the step name only (no tenant_id).
 */
export function recordStepDuration(step: string, durationMs: number): void {
  getInstruments().stepDurationMs.record(durationMs, { step })
}

/**
 * Record a cache lookup outcome.
 * `outcome` is one of: 'hit' (completed cache entry found), 'miss' (no cache
 * entry), 'coalesced' (pending in-flight entry coalesced onto).
 */
export function recordCacheLookup(
  tenantId: string,
  toolName: string,
  outcome: 'hit' | 'miss' | 'coalesced',
): void {
  getInstruments().cacheLookupTotal.add(1, { tenant_id: tenantId, tool_name: toolName, outcome })
}

/**
 * Record a sub-agent hidden event during resolveForSession (Plan 02 §8, R-02.9a).
 *
 * `reason`:
 *   - `'module_disabled'`       — every tool in the sub-agent's toolScope belongs to a disabled module.
 *   - `'permission_empty_scope'`— all tools were filtered by role permissions, leaving an empty scope.
 *
 * `sub_agent_key` is NOT included as a label — see the module-level doc comment
 * for the cardinality rationale. Per-sub-agent detail is captured on span attributes.
 */
export function recordSubAgentHidden(
  tenantId: string,
  reason: 'module_disabled' | 'permission_empty_scope',
): void {
  getInstruments().subAgentHiddenTotal.add(1, {
    tenant_id: tenantId,
    reason,
  })
}

/**
 * Record a permission narrative cache lookup outcome (Plan 02 §8, R-02.17..R-02.19).
 *
 * `outcome`:
 *   - `'hit'`  — the narrative hash already existed in the store (`wasAppended: false`).
 *   - `'miss'` — the narrative was generated and written for the first time (`wasAppended: true`).
 */
export function recordNarrativeCache(tenantId: string, outcome: 'hit' | 'miss'): void {
  getInstruments().narrativeCacheTotal.add(1, { tenant_id: tenantId, outcome })
}

/**
 * Record a router turn decision outcome (Plan 02 §8).
 * outcome ∈ 'bounded_plan' | 'disambiguation' | 'parse_escalated'
 */
export function recordRouterDecision(
  tenantId: string,
  outcome: 'bounded_plan' | 'disambiguation' | 'parse_escalated',
): void {
  getInstruments().routerDecisionsTotal.add(1, { tenant_id: tenantId, outcome })
}

/**
 * Record a router parse retry event (Plan 02 §8, R-02.23a).
 * Call once per turn that triggers the second LLM attempt.
 */
export function recordRouterParseRetry(tenantId: string): void {
  getInstruments().routerParseRetryTotal.add(1, { tenant_id: tenantId })
}

/**
 * Record a sub-agent invocation event (Plan 02 §8, R-02.23a).
 * Called once per directive per phase emitted in a bounded plan.
 *
 * DEVIATION from general cardinality discipline:
 *   `sub_agent_key` IS included as a metric label because Plan §8 explicitly
 *   specifies it. Cardinality is bounded by the registry size (low double digits).
 */
export function recordSubAgentInvoked(
  tenantId: string,
  subAgentKey: string,
  phase: 'phase1' | 'phase2',
): void {
  getInstruments().subAgentInvokedTotal.add(1, {
    tenant_id: tenantId,
    sub_agent_key: subAgentKey,
    phase,
  })
}
