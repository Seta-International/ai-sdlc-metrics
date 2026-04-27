/**
 * golden-trace-metrics.spec.ts — Plan 17 PR 4 Task 15
 *
 * OTel SDK in-memory verification for the golden-trace instruments:
 *
 *   agent_golden_trace_ci_run_total{result}                          counter
 *   agent_golden_trace_replay_miss_total{tool_name, trace_id}        counter
 *
 * Mirrors synthesizer-metrics.spec.ts: register one MeterProvider per spec file
 * (vitest isolates spec files in workers), reset the in-memory exporter and
 * the lazy instrument cache between tests via __INTERNAL_resetInstruments.
 *
 * Isolation strategy: CUMULATIVE temporality means the SDK accumulates counters
 * across the provider's lifetime. To avoid cross-test bleed, each test uses
 * unique attribute values (e.g. unique trace_id strings) so points from prior
 * tests never match the current test's filter. This mirrors the pattern used
 * by sub-agent-metrics.spec.ts and synthesizer-metrics.spec.ts.
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
  recordGoldenTraceCiRun,
  recordReplayMiss,
  __INTERNAL_resetInstruments,
} from './golden-trace-metrics'

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
            if (typeof rawValue === 'number') {
              points.push({
                attributes: dp.attributes as Record<string, unknown>,
                value: rawValue,
              })
            }
          }
        }
      }
    }
  }

  return points
}

// ─── recordGoldenTraceCiRun ───────────────────────────────────────────────────

describe('recordGoldenTraceCiRun', () => {
  it('increments agent_golden_trace_ci_run_total with result=pass', async () => {
    recordGoldenTraceCiRun({ result: 'pass' })

    const points = await flushAndGetPoints('agent_golden_trace_ci_run_total')
    const point = points.find((p) => p.attributes['result'] === 'pass')
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })

  it('partitions pass / regression / replay_failed independently', async () => {
    // Each result value produces its own attribute bucket; one emission each.
    recordGoldenTraceCiRun({ result: 'pass' })
    recordGoldenTraceCiRun({ result: 'regression' })
    recordGoldenTraceCiRun({ result: 'replay_failed' })

    const points = await flushAndGetPoints('agent_golden_trace_ci_run_total')

    const passPoint = points.find((p) => p.attributes['result'] === 'pass')
    const regressionPoint = points.find((p) => p.attributes['result'] === 'regression')
    const replayFailedPoint = points.find((p) => p.attributes['result'] === 'replay_failed')

    expect(passPoint).toBeDefined()
    expect(regressionPoint).toBeDefined()
    expect(replayFailedPoint).toBeDefined()
    // All three buckets exist — partition is working (values may be > 1 due to
    // CUMULATIVE accumulation across prior tests; we only assert existence here).
    expect(passPoint!.value).toBeGreaterThanOrEqual(1)
    expect(regressionPoint!.value).toBeGreaterThanOrEqual(1)
    expect(replayFailedPoint!.value).toBeGreaterThanOrEqual(1)
  })

  it('accumulates multiple calls under the same result label', async () => {
    // Use a unique trace_id-like result value isn't possible here (result is a
    // fixed union), so we verify the value is at least 3 after 3 calls to
    // regression, which is the correct accumulation behaviour.
    recordGoldenTraceCiRun({ result: 'regression' })
    recordGoldenTraceCiRun({ result: 'regression' })
    recordGoldenTraceCiRun({ result: 'regression' })

    const points = await flushAndGetPoints('agent_golden_trace_ci_run_total')
    const point = points.find((p) => p.attributes['result'] === 'regression')
    expect(point).toBeDefined()
    expect(point!.value).toBeGreaterThanOrEqual(3)
  })
})

// ─── recordReplayMiss ─────────────────────────────────────────────────────────

describe('recordReplayMiss', () => {
  it('increments agent_golden_trace_replay_miss_total with tool_name + trace_id labels', async () => {
    // Unique trace_id isolates this test from all others under CUMULATIVE mode.
    recordReplayMiss({ toolName: 'get_employee', traceId: 'trace-miss-t1' })

    const points = await flushAndGetPoints('agent_golden_trace_replay_miss_total')
    const point = points.find(
      (p) =>
        p.attributes['tool_name'] === 'get_employee' &&
        p.attributes['trace_id'] === 'trace-miss-t1',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })

  it('accumulates calls under same tool_name + trace_id labels', async () => {
    // Unique trace_id isolates accumulation test from t1 above.
    recordReplayMiss({ toolName: '*', traceId: 'trace-miss-t2' })
    recordReplayMiss({ toolName: '*', traceId: 'trace-miss-t2' })

    const points = await flushAndGetPoints('agent_golden_trace_replay_miss_total')
    const point = points.find(
      (p) => p.attributes['tool_name'] === '*' && p.attributes['trace_id'] === 'trace-miss-t2',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(2)
  })

  it('partitions different trace_ids independently', async () => {
    // Two unique trace_ids — separate attribute buckets, each value = 1.
    recordReplayMiss({ toolName: '*', traceId: 'trace-miss-t3-A' })
    recordReplayMiss({ toolName: '*', traceId: 'trace-miss-t3-B' })

    const points = await flushAndGetPoints('agent_golden_trace_replay_miss_total')
    const pointA = points.find((p) => p.attributes['trace_id'] === 'trace-miss-t3-A')
    const pointB = points.find((p) => p.attributes['trace_id'] === 'trace-miss-t3-B')
    expect(pointA!.value).toBe(1)
    expect(pointB!.value).toBe(1)
  })
})

// ─── __INTERNAL_resetInstruments ──────────────────────────────────────────────

describe('__INTERNAL_resetInstruments', () => {
  it('drops cached instruments so the next call re-acquires them', async () => {
    // Unique trace_id ensures this test's replay-miss bucket is isolated.
    recordReplayMiss({ toolName: 'reset-tool', traceId: 'trace-reset-t4' })

    __INTERNAL_resetInstruments()
    // After reset, lazy init re-acquires instruments; the counter must still
    // increment on the next call.
    recordReplayMiss({ toolName: 'reset-tool', traceId: 'trace-reset-t4' })

    const points = await flushAndGetPoints('agent_golden_trace_replay_miss_total')
    const point = points.find((p) => p.attributes['trace_id'] === 'trace-reset-t4')
    expect(point).toBeDefined()
    expect(point!.value).toBe(2)
  })
})
