/**
 * streaming-metrics.spec.ts — Plan 06 §8 streaming / SSE / cancellation instruments.
 *
 * Verifies that each helper function records the correct metric name, type,
 * value, and label set. Follows the same OTel SDK in-memory test pattern as
 * gateway-metrics.spec.ts and observability-metrics.spec.ts.
 *
 * OTel API v2: setGlobalMeterProvider may only be called once per process.
 * We register once at module load time and reset the exporter between tests.
 *
 * ── Instruments under test (Plan 06 §8) ──────────────────────────────────────
 *
 * agent_turn_total{tenant_id, topology, reason}              counter
 * agent_turn_duration_ms{tenant_id, reason}                  histogram
 * agent_abort_total{tenant_id, source, reason}               counter
 * agent_ordering_violation_total{producer}                   counter
 * agent_identity_key_write_attempted_total                   counter (no labels — P1)
 * agent_sse_backpressure_total{tenant_id}                    counter
 * agent_turn_force_stopped_total{tenant_id, actor_role}      counter
 * agent_active_turn_sweep_total{tenant_id, cause}            counter
 * agent_draft_persist_failure_total{tenant_id}               counter
 * agent_progress_event_total{tenant_id, cause}               counter
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  MeterProvider,
  InMemoryMetricExporter,
  PeriodicExportingMetricReader,
  AggregationTemporality,
} from '@opentelemetry/sdk-metrics'
import { metrics } from '@opentelemetry/api'
import {
  recordTurnTotal,
  recordTurnDuration,
  recordAbortTotal,
  recordOrderingViolation,
  recordIdentityKeyWriteAttempted,
  recordSseBackpressure,
  recordTurnForceStopped,
  recordActiveTurnSweep,
  recordDraftPersistFailure,
  recordProgressEvent,
  __INTERNAL_resetInstruments,
} from './streaming-metrics'

// ─── One-time OTel meter provider setup ──────────────────────────────────────

const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE)
const meterProvider = new MeterProvider({
  readers: [
    new PeriodicExportingMetricReader({
      exporter,
      exportIntervalMillis: 100_000,
    }),
  ],
})
metrics.setGlobalMeterProvider(meterProvider)

beforeEach(() => {
  exporter.reset()
  __INTERNAL_resetInstruments()
})

// ─── Helper ───────────────────────────────────────────────────────────────────

interface DataPoint {
  attributes: Record<string, unknown>
  value: number
}

async function flushAndGetPoints(metricName: string): Promise<DataPoint[]> {
  await meterProvider.forceFlush()
  const points: DataPoint[] = []

  for (const rm of exporter.getMetrics()) {
    for (const sm of rm.scopeMetrics) {
      for (const metric of sm.metrics) {
        if (metric.descriptor.name === metricName) {
          for (const dp of metric.dataPoints) {
            const rawValue = dp.value
            const value =
              typeof rawValue === 'number'
                ? rawValue
                : typeof rawValue === 'object' && rawValue !== null && 'sum' in rawValue
                  ? (rawValue as { sum: number }).sum
                  : 0
            points.push({ attributes: dp.attributes as Record<string, unknown>, value })
          }
        }
      }
    }
  }

  return points
}

// ─── agent_turn_total ─────────────────────────────────────────────────────────

describe('recordTurnTotal', () => {
  it('increments agent_turn_total with tenant_id, topology, reason labels', async () => {
    recordTurnTotal('tenant-tt-1', 'bounded', 'completed')

    const points = await flushAndGetPoints('agent_turn_total')
    const point = points.find(
      (p) =>
        p.attributes['tenant_id'] === 'tenant-tt-1' &&
        p.attributes['topology'] === 'bounded' &&
        p.attributes['reason'] === 'completed',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })

  it('records topology=iterative', async () => {
    recordTurnTotal('tenant-tt-2', 'iterative', 'cancelled')

    const points = await flushAndGetPoints('agent_turn_total')
    const point = points.find(
      (p) =>
        p.attributes['tenant_id'] === 'tenant-tt-2' && p.attributes['topology'] === 'iterative',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })

  it('accumulates multiple turns', async () => {
    recordTurnTotal('tenant-tt-3', 'bounded', 'completed')
    recordTurnTotal('tenant-tt-3', 'bounded', 'completed')

    const points = await flushAndGetPoints('agent_turn_total')
    const point = points.find(
      (p) => p.attributes['tenant_id'] === 'tenant-tt-3' && p.attributes['reason'] === 'completed',
    )
    expect(point?.value).toBe(2)
  })

  it('R-05.30: does NOT carry user_id label', async () => {
    recordTurnTotal('tenant-tt-4', 'bounded', 'error')

    const points = await flushAndGetPoints('agent_turn_total')
    const point = points.find((p) => p.attributes['tenant_id'] === 'tenant-tt-4')
    expect(point).toBeDefined()
    expect('user_id' in point!.attributes).toBe(false)
  })
})

// ─── agent_turn_duration_ms ───────────────────────────────────────────────────

describe('recordTurnDuration', () => {
  it('records agent_turn_duration_ms histogram with tenant_id and reason', async () => {
    recordTurnDuration('tenant-td-1', 'completed', 1500)

    const points = await flushAndGetPoints('agent_turn_duration_ms')
    const point = points.find(
      (p) => p.attributes['tenant_id'] === 'tenant-td-1' && p.attributes['reason'] === 'completed',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(1500)
  })

  it('accumulates sum across multiple turns', async () => {
    recordTurnDuration('tenant-td-2', 'timeout', 3000)
    recordTurnDuration('tenant-td-2', 'timeout', 5000)

    const points = await flushAndGetPoints('agent_turn_duration_ms')
    const point = points.find(
      (p) => p.attributes['tenant_id'] === 'tenant-td-2' && p.attributes['reason'] === 'timeout',
    )
    expect(point?.value).toBe(8000)
  })
})

// ─── agent_abort_total ────────────────────────────────────────────────────────

describe('recordAbortTotal', () => {
  it('increments agent_abort_total with tenant_id, source=user, reason=cancelled', async () => {
    recordAbortTotal('tenant-ab-1', 'user', 'cancelled')

    const points = await flushAndGetPoints('agent_abort_total')
    const point = points.find(
      (p) =>
        p.attributes['tenant_id'] === 'tenant-ab-1' &&
        p.attributes['source'] === 'user' &&
        p.attributes['reason'] === 'cancelled',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })

  it('records source=timeout and source=system', async () => {
    recordAbortTotal('tenant-ab-2', 'timeout', 'timeout')
    recordAbortTotal('tenant-ab-3', 'system', 'budget')

    const pTimeout = await flushAndGetPoints('agent_abort_total')
    const pt = pTimeout.find((p) => p.attributes['source'] === 'timeout')
    const ps = pTimeout.find((p) => p.attributes['source'] === 'system')
    expect(pt).toBeDefined()
    expect(ps).toBeDefined()
  })

  it('accumulates across multiple aborts', async () => {
    recordAbortTotal('tenant-ab-4', 'user', 'cancelled')
    recordAbortTotal('tenant-ab-4', 'user', 'cancelled')

    const points = await flushAndGetPoints('agent_abort_total')
    const point = points.find(
      (p) => p.attributes['tenant_id'] === 'tenant-ab-4' && p.attributes['source'] === 'user',
    )
    expect(point?.value).toBe(2)
  })
})

// ─── agent_ordering_violation_total ──────────────────────────────────────────

describe('recordOrderingViolation', () => {
  it('increments agent_ordering_violation_total with producer label', async () => {
    recordOrderingViolation('synthesizer')

    const points = await flushAndGetPoints('agent_ordering_violation_total')
    const point = points.find((p) => p.attributes['producer'] === 'synthesizer')
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })

  it('accumulates — P2 alert fires on any positive value', async () => {
    recordOrderingViolation('phase-executor')
    recordOrderingViolation('phase-executor')

    const points = await flushAndGetPoints('agent_ordering_violation_total')
    const point = points.find((p) => p.attributes['producer'] === 'phase-executor')
    expect(point?.value).toBe(2)
  })
})

// ─── agent_identity_key_write_attempted_total ─────────────────────────────────

describe('recordIdentityKeyWriteAttempted', () => {
  it('increments agent_identity_key_write_attempted_total (no labels)', async () => {
    recordIdentityKeyWriteAttempted()

    const points = await flushAndGetPoints('agent_identity_key_write_attempted_total')
    expect(points.length).toBeGreaterThan(0)
    expect(points[0]!.value).toBe(1)
  })

  it('accumulates — P1 alert fires on any positive value', async () => {
    // Call 3 times. The counter is no-label, so it accumulates with any
    // previous calls in this test run. We assert value >= 3 to be robust
    // against cumulative aggregation carry-over from the previous test.
    recordIdentityKeyWriteAttempted()
    recordIdentityKeyWriteAttempted()
    recordIdentityKeyWriteAttempted()

    const points = await flushAndGetPoints('agent_identity_key_write_attempted_total')
    expect(points.length).toBeGreaterThan(0)
    expect(points[0]!.value).toBeGreaterThanOrEqual(3)
  })
})

// ─── agent_sse_backpressure_total ─────────────────────────────────────────────

describe('recordSseBackpressure', () => {
  it('increments agent_sse_backpressure_total with tenant_id label', async () => {
    recordSseBackpressure('tenant-bp-1')

    const points = await flushAndGetPoints('agent_sse_backpressure_total')
    const point = points.find((p) => p.attributes['tenant_id'] === 'tenant-bp-1')
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })

  it('accumulates backpressure events', async () => {
    recordSseBackpressure('tenant-bp-2')
    recordSseBackpressure('tenant-bp-2')

    const points = await flushAndGetPoints('agent_sse_backpressure_total')
    const point = points.find((p) => p.attributes['tenant_id'] === 'tenant-bp-2')
    expect(point?.value).toBe(2)
  })
})

// ─── agent_turn_force_stopped_total ──────────────────────────────────────────

describe('recordTurnForceStopped', () => {
  it('increments agent_turn_force_stopped_total with tenant_id and actor_role=admin', async () => {
    recordTurnForceStopped('tenant-fs-1', 'admin')

    const points = await flushAndGetPoints('agent_turn_force_stopped_total')
    const point = points.find(
      (p) => p.attributes['tenant_id'] === 'tenant-fs-1' && p.attributes['actor_role'] === 'admin',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })

  it('records actor_role=platform_admin', async () => {
    recordTurnForceStopped('tenant-fs-2', 'platform_admin')

    const points = await flushAndGetPoints('agent_turn_force_stopped_total')
    const point = points.find(
      (p) =>
        p.attributes['tenant_id'] === 'tenant-fs-2' &&
        p.attributes['actor_role'] === 'platform_admin',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })
})

// ─── agent_active_turn_sweep_total ────────────────────────────────────────────

describe('recordActiveTurnSweep', () => {
  it('increments agent_active_turn_sweep_total with tenant_id and cause=heartbeat_expired', async () => {
    recordActiveTurnSweep('tenant-sw-1', 'heartbeat_expired')

    const points = await flushAndGetPoints('agent_active_turn_sweep_total')
    const point = points.find(
      (p) =>
        p.attributes['tenant_id'] === 'tenant-sw-1' &&
        p.attributes['cause'] === 'heartbeat_expired',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })

  it('records cause=pod_crash_detected', async () => {
    recordActiveTurnSweep('tenant-sw-2', 'pod_crash_detected')

    const points = await flushAndGetPoints('agent_active_turn_sweep_total')
    const point = points.find(
      (p) =>
        p.attributes['tenant_id'] === 'tenant-sw-2' &&
        p.attributes['cause'] === 'pod_crash_detected',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })
})

// ─── agent_draft_persist_failure_total ────────────────────────────────────────

describe('recordDraftPersistFailure', () => {
  it('increments agent_draft_persist_failure_total with tenant_id label', async () => {
    recordDraftPersistFailure('tenant-dpf-1')

    const points = await flushAndGetPoints('agent_draft_persist_failure_total')
    const point = points.find((p) => p.attributes['tenant_id'] === 'tenant-dpf-1')
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })

  it('non-zero value triggers P2 alert — accumulates correctly', async () => {
    recordDraftPersistFailure('tenant-dpf-2')
    recordDraftPersistFailure('tenant-dpf-2')

    const points = await flushAndGetPoints('agent_draft_persist_failure_total')
    const point = points.find((p) => p.attributes['tenant_id'] === 'tenant-dpf-2')
    expect(point?.value).toBe(2)
  })
})

// ─── agent_progress_event_total ───────────────────────────────────────────────

describe('recordProgressEvent', () => {
  const causes = ['vendor_retry', 'fallback', 'long_tool'] as const

  for (const cause of causes) {
    it(`increments agent_progress_event_total with cause=${cause}`, async () => {
      recordProgressEvent(`tenant-pe-${cause}`, cause)

      const points = await flushAndGetPoints('agent_progress_event_total')
      const point = points.find(
        (p) =>
          p.attributes['tenant_id'] === `tenant-pe-${cause}` && p.attributes['cause'] === cause,
      )
      expect(point).toBeDefined()
      expect(point!.value).toBe(1)
    })
  }

  it('accumulates across multiple progress events', async () => {
    recordProgressEvent('tenant-pe-acc', 'vendor_retry')
    recordProgressEvent('tenant-pe-acc', 'vendor_retry')

    const points = await flushAndGetPoints('agent_progress_event_total')
    const point = points.find(
      (p) =>
        p.attributes['tenant_id'] === 'tenant-pe-acc' && p.attributes['cause'] === 'vendor_retry',
    )
    expect(point?.value).toBe(2)
  })
})
