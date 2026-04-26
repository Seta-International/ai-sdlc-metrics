/**
 * synthesizer-metrics.spec.ts — Plan 17 PR 3 Task 12
 *
 * OTel SDK in-memory verification for the synthesizer instruments:
 *
 *   agent_synthesizer_call_total{shape, surface, outcome}            counter
 *   agent_synthesizer_latency_ms{shape, surface, outcome}            histogram
 *   agent_synthesizer_fallback_total{cause}                          counter
 *
 * Mirrors sub-agent-metrics.spec.ts: register one MeterProvider per spec file
 * (vitest isolates spec files in workers), reset the in-memory exporter and
 * the lazy instrument cache between tests via __INTERNAL_resetInstruments.
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
  recordSynthesizerCall,
  recordSynthesizerFallback,
  recordSynthesizerLatency,
  __INTERNAL_resetInstruments,
} from './synthesizer-metrics'
import type { SynthesizerStreamFailureCause } from '../../application/services/synthesizer-errors'

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
  // Only present for histogram points; counters expose `value` directly.
  count?: number
  sum?: number
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
            } else if (typeof rawValue === 'object' && rawValue !== null) {
              const obj = rawValue as { sum?: number; count?: number }
              points.push({
                attributes: dp.attributes as Record<string, unknown>,
                value: obj.sum ?? 0,
                sum: obj.sum,
                count: obj.count,
              })
            }
          }
        }
      }
    }
  }

  return points
}

// ─── recordSynthesizerCall ────────────────────────────────────────────────────

describe('recordSynthesizerCall', () => {
  it('increments agent_synthesizer_call_total with shape + surface + outcome=completed', async () => {
    recordSynthesizerCall({ shape: 'narrative', surface: 'global-chat', outcome: 'completed' })

    const points = await flushAndGetPoints('agent_synthesizer_call_total')
    const point = points.find(
      (p) =>
        p.attributes['shape'] === 'narrative' &&
        p.attributes['surface'] === 'global-chat' &&
        p.attributes['outcome'] === 'completed',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })

  it('accumulates across calls with identical labels', async () => {
    recordSynthesizerCall({ shape: 'accum-shape', surface: 'global-chat', outcome: 'completed' })
    recordSynthesizerCall({ shape: 'accum-shape', surface: 'global-chat', outcome: 'completed' })
    recordSynthesizerCall({ shape: 'accum-shape', surface: 'global-chat', outcome: 'completed' })

    const points = await flushAndGetPoints('agent_synthesizer_call_total')
    const point = points.find((p) => p.attributes['shape'] === 'accum-shape')
    expect(point).toBeDefined()
    expect(point!.value).toBe(3)
  })

  it('partitions completed and errored outcomes independently', async () => {
    recordSynthesizerCall({ shape: 'partition-shape', surface: 'inline', outcome: 'completed' })
    recordSynthesizerCall({ shape: 'partition-shape', surface: 'inline', outcome: 'errored' })

    const points = await flushAndGetPoints('agent_synthesizer_call_total')
    const completed = points.find(
      (p) => p.attributes['shape'] === 'partition-shape' && p.attributes['outcome'] === 'completed',
    )
    const errored = points.find(
      (p) => p.attributes['shape'] === 'partition-shape' && p.attributes['outcome'] === 'errored',
    )
    expect(completed!.value).toBe(1)
    expect(errored!.value).toBe(1)
  })
})

// ─── recordSynthesizerLatency ─────────────────────────────────────────────────

describe('recordSynthesizerLatency', () => {
  it('records the duration into agent_synthesizer_latency_ms histogram', async () => {
    recordSynthesizerLatency({
      shape: 'list',
      surface: 'inline',
      outcome: 'completed',
      durationMs: 500,
    })

    const points = await flushAndGetPoints('agent_synthesizer_latency_ms')
    const point = points.find(
      (p) =>
        p.attributes['shape'] === 'list' &&
        p.attributes['surface'] === 'inline' &&
        p.attributes['outcome'] === 'completed',
    )
    expect(point).toBeDefined()
    expect(point!.sum).toBe(500)
    expect(point!.count).toBe(1)
  })

  it('aggregates multiple recordings under the same labels', async () => {
    recordSynthesizerLatency({
      shape: 'narrative',
      surface: 'global-chat',
      outcome: 'completed',
      durationMs: 100,
    })
    recordSynthesizerLatency({
      shape: 'narrative',
      surface: 'global-chat',
      outcome: 'completed',
      durationMs: 250,
    })

    const points = await flushAndGetPoints('agent_synthesizer_latency_ms')
    const point = points.find(
      (p) => p.attributes['shape'] === 'narrative' && p.attributes['outcome'] === 'completed',
    )
    expect(point!.sum).toBe(350)
    expect(point!.count).toBe(2)
  })
})

// ─── recordSynthesizerFallback ────────────────────────────────────────────────

describe('recordSynthesizerFallback', () => {
  it.each<SynthesizerStreamFailureCause>([
    'pre_shape_failure',
    'stream_error',
    'schema_validation',
  ])('records cause=%s into agent_synthesizer_fallback_total', async (cause) => {
    recordSynthesizerFallback({ cause })

    const points = await flushAndGetPoints('agent_synthesizer_fallback_total')
    const point = points.find((p) => p.attributes['cause'] === cause)
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })
})

// ─── __INTERNAL_resetInstruments ──────────────────────────────────────────────

describe('__INTERNAL_resetInstruments', () => {
  it('drops cached instruments so the next call re-acquires them', async () => {
    // First call lazy-creates the counter under the current global provider.
    recordSynthesizerCall({ shape: 'reset-shape', surface: 'global-chat', outcome: 'completed' })

    // Resetting should clear the cache; the next call must re-acquire from the
    // (still-installed) global provider and increment again successfully.
    __INTERNAL_resetInstruments()
    recordSynthesizerCall({ shape: 'reset-shape', surface: 'global-chat', outcome: 'completed' })

    const points = await flushAndGetPoints('agent_synthesizer_call_total')
    const point = points.find((p) => p.attributes['shape'] === 'reset-shape')
    expect(point).toBeDefined()
    expect(point!.value).toBe(2)
  })
})
