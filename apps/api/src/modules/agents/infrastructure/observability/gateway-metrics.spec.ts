/**
 * gateway-metrics.spec.ts
 *
 * Uses the OTel SDK's InMemoryMetricExporter + MeterProvider to verify
 * counter + histogram instruments. Each test:
 *  1. Calls the helper function under test.
 *  2. Force-flushes to ensure data points are exported.
 *  3. Inspects the exported ResourceMetrics for correct names, values, and label sets.
 *
 * OTel API v2 note: `metrics.setGlobalMeterProvider` can only be called ONCE —
 * re-registration returns false and is a no-op. We register once at module load
 * time for the entire spec file, and reset the exporter between tests using
 * `exporter.reset()`.
 *
 * Label discipline (R-05.30 / R-05.31):
 *  - agent_tool_call_total     → must have tenant_id
 *  - agent_tool_tripwire_total → must have tenant_id
 *  - agent_gateway_step_duration_ms → must NOT have tenant_id
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
  recordToolCall,
  recordTripwire,
  recordStepDuration,
  recordCacheLookup,
  _resetInstrumentsForTest,
} from './gateway-metrics'

// ─── One-time OTel meter provider setup ──────────────────────────────────────
//
// OTel API intentionally prevents re-registration of the global MeterProvider
// (setGlobalMeterProvider returns false and is a no-op on second call).
// We register once for the entire spec file and reset the exporter between tests.

const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE)
const meterProvider = new MeterProvider({
  readers: [
    new PeriodicExportingMetricReader({
      exporter,
      // Long interval — we rely on forceFlush(), not the timer
      exportIntervalMillis: 100_000,
    }),
  ],
})
metrics.setGlobalMeterProvider(meterProvider)

// Reset exporter and instrument cache before each test so data points don't bleed.
// _resetInstrumentsForTest() clears the cached instruments so the next call to
// a helper function re-acquires the meter from the (already registered) provider.
beforeEach(() => {
  exporter.reset()
  _resetInstrumentsForTest()
})

// ─── Helper: get a metric's data points from the latest export ────────────────

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
            // Counter data points have a numeric value; histogram data points have
            // a { count, sum, min, max, buckets } object — we use `sum` for histograms.
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('recordToolCall', () => {
  it('increments agent_tool_call_total with tenant_id, tool_name, result_status labels', async () => {
    recordToolCall('tenant-abc', 'planner.task.list', 'success')

    const points = await flushAndGetPoints('agent_tool_call_total')
    expect(points.length).toBeGreaterThan(0)

    const point = points.find(
      (p) =>
        p.attributes['tenant_id'] === 'tenant-abc' &&
        p.attributes['tool_name'] === 'planner.task.list' &&
        p.attributes['result_status'] === 'success',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })

  it('accumulates count across multiple calls for the same labels', async () => {
    recordToolCall('t1', 'foo.bar', 'success')
    recordToolCall('t1', 'foo.bar', 'success')
    recordToolCall('t1', 'foo.bar', 'success')

    const points = await flushAndGetPoints('agent_tool_call_total')
    const point = points.find(
      (p) => p.attributes['tenant_id'] === 't1' && p.attributes['tool_name'] === 'foo.bar',
    )
    expect(point?.value).toBe(3)
  })

  it('R-05.31: tenant_id IS present on agent_tool_call_total', async () => {
    recordToolCall('tenant-x', 'any.tool', 'permission_denied')

    const points = await flushAndGetPoints('agent_tool_call_total')
    expect(points.length).toBeGreaterThan(0)
    const hasTenantId = points.some((p) => 'tenant_id' in p.attributes)
    expect(hasTenantId).toBe(true)
  })
})

describe('recordTripwire', () => {
  it('increments agent_tool_tripwire_total with tenant_id, variant, disposition labels', async () => {
    recordTripwire('tenant-xyz', 'permission_denied', 'abort')

    const points = await flushAndGetPoints('agent_tool_tripwire_total')
    expect(points.length).toBeGreaterThan(0)

    const point = points.find(
      (p) =>
        p.attributes['tenant_id'] === 'tenant-xyz' &&
        p.attributes['variant'] === 'permission_denied' &&
        p.attributes['disposition'] === 'abort',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })

  it('R-05.31: tenant_id IS present on agent_tool_tripwire_total', async () => {
    recordTripwire('tenant-t', 'ceiling_breach_bytes', 'retry')

    const points = await flushAndGetPoints('agent_tool_tripwire_total')
    const hasTenantId = points.some((p) => 'tenant_id' in p.attributes)
    expect(hasTenantId).toBe(true)
  })
})

describe('recordStepDuration', () => {
  it('records agent_gateway_step_duration_ms with step label', async () => {
    recordStepDuration('invoke', 42.5)

    const points = await flushAndGetPoints('agent_gateway_step_duration_ms')
    expect(points.length).toBeGreaterThan(0)

    const point = points.find((p) => p.attributes['step'] === 'invoke')
    expect(point).toBeDefined()
  })

  it('R-05.31: tenant_id is NOT present on agent_gateway_step_duration_ms', async () => {
    recordStepDuration('resolve', 10)

    const points = await flushAndGetPoints('agent_gateway_step_duration_ms')
    expect(points.length).toBeGreaterThan(0)

    // Every data point must NOT have tenant_id (step duration is infra-level,
    // not tenant-attributed — see module-level doc comment for rationale)
    const hasTenantId = points.some((p) => 'tenant_id' in p.attributes)
    expect(hasTenantId).toBe(false)
  })
})

describe('recordCacheLookup', () => {
  it('increments agent_tool_cache_lookup_total with outcome=hit', async () => {
    recordCacheLookup('tenant-1', 'planner.task.list', 'hit')

    const points = await flushAndGetPoints('agent_tool_cache_lookup_total')
    const point = points.find(
      (p) =>
        p.attributes['tenant_id'] === 'tenant-1' &&
        p.attributes['tool_name'] === 'planner.task.list' &&
        p.attributes['outcome'] === 'hit',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })

  it('increments agent_tool_cache_lookup_total with outcome=miss', async () => {
    recordCacheLookup('tenant-2', 'goals.okr.list', 'miss')

    const points = await flushAndGetPoints('agent_tool_cache_lookup_total')
    const point = points.find(
      (p) => p.attributes['outcome'] === 'miss' && p.attributes['tenant_id'] === 'tenant-2',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })

  it('increments agent_tool_cache_lookup_total with outcome=coalesced', async () => {
    recordCacheLookup('tenant-3', 'time.attendance.get', 'coalesced')

    const points = await flushAndGetPoints('agent_tool_cache_lookup_total')
    const point = points.find((p) => p.attributes['outcome'] === 'coalesced')
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })
})
