/**
 * observability-metrics.spec.ts — Plan 07 meta-metrics
 *
 * Verifies that each helper function records the correct metric name and label set.
 * Follows the same OTel SDK test pattern as gateway-metrics.spec.ts.
 *
 * OTel API v2 note: setGlobalMeterProvider can only be called ONCE per process.
 * We register once at module load time and reset the exporter between tests.
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
  recordSamplingDecision,
  recordPiiRedaction,
  recordNonLeafUsageWarning,
  recordTraceAuditJoinMiss,
  recordLeakCanary,
  setTenantTraceQuotaUsed,
  __INTERNAL_resetInstruments,
} from './observability-metrics'

// ─── One-time OTel meter provider setup ───────────────────────────────────────

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

// ─── Helper ────────────────────────────────────────────────────────────────────

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

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('recordSamplingDecision', () => {
  it('increments agent_sampling_decision_total with capture=true and reason label', async () => {
    recordSamplingDecision(true, 'trigger_match')

    const points = await flushAndGetPoints('agent_sampling_decision_total')
    const point = points.find(
      (p) => p.attributes['capture'] === 'true' && p.attributes['reason'] === 'trigger_match',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })

  it('increments agent_sampling_decision_total with capture=false and reason label', async () => {
    recordSamplingDecision(false, 'quota_exceeded')

    const points = await flushAndGetPoints('agent_sampling_decision_total')
    const point = points.find(
      (p) => p.attributes['capture'] === 'false' && p.attributes['reason'] === 'quota_exceeded',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })
})

describe('recordPiiRedaction', () => {
  it('increments agent_pii_redaction_total with tool_name label', async () => {
    recordPiiRedaction('planner.task.list')

    const points = await flushAndGetPoints('agent_pii_redaction_total')
    const point = points.find((p) => p.attributes['tool_name'] === 'planner.task.list')
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })
})

describe('recordNonLeafUsageWarning', () => {
  it('increments agent_usage_recorded_on_non_leaf_total', async () => {
    recordNonLeafUsageWarning()
    recordNonLeafUsageWarning()

    const points = await flushAndGetPoints('agent_usage_recorded_on_non_leaf_total')
    expect(points.length).toBeGreaterThan(0)
    expect(points[0]!.value).toBe(2)
  })
})

describe('recordTraceAuditJoinMiss', () => {
  it('increments agent_trace_audit_join_miss_total', async () => {
    recordTraceAuditJoinMiss()

    const points = await flushAndGetPoints('agent_trace_audit_join_miss_total')
    expect(points.length).toBeGreaterThan(0)
    expect(points[0]!.value).toBe(1)
  })
})

describe('recordLeakCanary', () => {
  it('increments agent_cross_tenant_leak_canary_total with result=clean', async () => {
    recordLeakCanary('clean')

    const points = await flushAndGetPoints('agent_cross_tenant_leak_canary_total')
    const point = points.find((p) => p.attributes['result'] === 'clean')
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })

  it('increments agent_cross_tenant_leak_canary_total with result=leak_detected', async () => {
    recordLeakCanary('leak_detected')

    const points = await flushAndGetPoints('agent_cross_tenant_leak_canary_total')
    const point = points.find((p) => p.attributes['result'] === 'leak_detected')
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })
})

describe('setTenantTraceQuotaUsed', () => {
  it('reports agent_tenant_trace_quota_used gauge with tenant_id and fraction', async () => {
    setTenantTraceQuotaUsed('tenant-abc', 0.75)

    const points = await flushAndGetPoints('agent_tenant_trace_quota_used')
    const point = points.find((p) => p.attributes['tenant_id'] === 'tenant-abc')
    expect(point).toBeDefined()
    expect(point!.value).toBe(0.75)
  })

  it('updates the gauge when called multiple times for the same tenant', async () => {
    setTenantTraceQuotaUsed('tenant-xyz', 0.5)

    // Flush once to ensure first value is captured, then update and flush again.
    await flushAndGetPoints('agent_tenant_trace_quota_used')
    exporter.reset()

    setTenantTraceQuotaUsed('tenant-xyz', 0.9)

    const points = await flushAndGetPoints('agent_tenant_trace_quota_used')
    const point = points.find((p) => p.attributes['tenant_id'] === 'tenant-xyz')
    expect(point).toBeDefined()
    expect(point!.value).toBe(0.9)
  })

  it('tracks multiple tenants independently', async () => {
    setTenantTraceQuotaUsed('tenant-1', 0.2)
    setTenantTraceQuotaUsed('tenant-2', 0.8)

    const points = await flushAndGetPoints('agent_tenant_trace_quota_used')

    const t1 = points.find((p) => p.attributes['tenant_id'] === 'tenant-1')
    const t2 = points.find((p) => p.attributes['tenant_id'] === 'tenant-2')

    expect(t1).toBeDefined()
    expect(t1!.value).toBe(0.2)
    expect(t2).toBeDefined()
    expect(t2!.value).toBe(0.8)
  })
})
