/**
 * Event-router metrics for Plan 09 §8.
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
 * agent_event_router_cross_tenant_rejected_total{tenant_id, event_type}   counter
 *   Any non-zero value is a P0 candidate.
 *   Incremented by AgentEventRouter when event.tenant_id !== schedule.tenant_id.
 *   Labels: tenant_id (the event's tenant), event_type (the domain event type string).
 *
 * ── Label cardinality guardrail (R-05.30 / R-05.31) ─────────────────────────
 *
 * BLOCKED_LABELS = [user_id, conversation_id, trace_id, delegation_id, schedule_id]
 * None of the above labels appear on any instrument defined here.
 */

import { metrics, ValueType, type Counter } from '@opentelemetry/api'

interface EventRouterInstruments {
  /**
   * agent_event_router_cross_tenant_rejected_total{tenant_id, event_type}
   *
   * Counter incremented when the event router rejects a cross-tenant pairing —
   * i.e. event.tenant_id !== schedule.tenant_id.
   * Any non-zero value is a P0 candidate; alert on first increment.
   */
  crossTenantRejectedTotal: Counter
}

let _instruments: EventRouterInstruments | undefined

function getInstruments(): EventRouterInstruments {
  if (_instruments) return _instruments

  const meter = metrics.getMeter('agents.event-router')

  const crossTenantRejectedTotal = meter.createCounter(
    'agent_event_router_cross_tenant_rejected_total',
    {
      description:
        'Cross-tenant event/schedule routing rejections. ' +
        'Any non-zero value is a P0 candidate; alert on first increment. ' +
        'Labels: tenant_id (the event tenant), event_type (the domain event type).',
      valueType: ValueType.INT,
    },
  )

  _instruments = { crossTenantRejectedTotal }
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
 * Increment the cross-tenant rejection counter.
 * Call when the event router detects event.tenant_id !== schedule.tenant_id.
 *
 * Labels: tenant_id (the event's tenant), event_type (the domain event type string).
 *
 * Any non-zero reading on this metric is a P0 incident candidate and must
 * trigger an on-call page.
 */
export function recordCrossTenantRejected(tenantId: string, eventType: string): void {
  getInstruments().crossTenantRejectedTotal.add(1, {
    tenant_id: tenantId,
    event_type: eventType,
  })
}
