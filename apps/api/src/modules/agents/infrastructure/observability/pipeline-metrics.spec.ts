/**
 * pipeline-metrics.spec.ts — Plan 18 Task 9
 *
 * OTel SDK in-memory verification for the live-pipeline instruments:
 *
 *   agent_pipeline_dispatch_total{kind, outcome}                      counter
 *   agent_bounded_executor_phase_duration_ms{phase, outcome}          histogram
 *   agent_bounded_executor_drafts_total{phase, sub_agent_key}         counter
 *
 * Mirrors sub-agent-metrics.spec.ts / synthesizer-metrics.spec.ts: register one
 * MeterProvider per spec file (vitest isolates spec files in workers), reset
 * the in-memory exporter and the lazy instrument cache between tests via
 * __INTERNAL_resetInstruments.
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
  recordPipelineDispatch,
  recordBoundedExecutorPhaseDuration,
  recordBoundedExecutorDrafts,
  __INTERNAL_resetInstruments,
} from './pipeline-metrics'

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

// ─── recordPipelineDispatch ───────────────────────────────────────────────────

describe('recordPipelineDispatch', () => {
  it('increments agent_pipeline_dispatch_total with kind + outcome attrs', async () => {
    // Unique label set so cumulative aggregation does not collide with later tests.
    recordPipelineDispatch({ kind: 'iterative', outcome: 'refused' })

    const points = await flushAndGetPoints('agent_pipeline_dispatch_total')
    const point = points.find(
      (p) => p.attributes['kind'] === 'iterative' && p.attributes['outcome'] === 'refused',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })

  it.each<{
    kind: 'bounded' | 'iterative' | 'disambiguation'
    outcome: 'completed' | 'cancelled' | 'refused' | 'error'
  }>([
    { kind: 'bounded', outcome: 'completed' },
    { kind: 'bounded', outcome: 'cancelled' },
    { kind: 'bounded', outcome: 'error' },
    { kind: 'iterative', outcome: 'cancelled' },
    { kind: 'disambiguation', outcome: 'refused' },
  ])('records kind=$kind outcome=$outcome with matching attrs', async ({ kind, outcome }) => {
    recordPipelineDispatch({ kind, outcome })

    const points = await flushAndGetPoints('agent_pipeline_dispatch_total')
    const point = points.find(
      (p) => p.attributes['kind'] === kind && p.attributes['outcome'] === outcome,
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })

  it('accumulates across calls with identical labels', async () => {
    // Unique kind value so other tests don't pre-populate this datapoint.
    recordPipelineDispatch({ kind: 'disambiguation', outcome: 'error' })
    recordPipelineDispatch({ kind: 'disambiguation', outcome: 'error' })
    recordPipelineDispatch({ kind: 'disambiguation', outcome: 'error' })

    const points = await flushAndGetPoints('agent_pipeline_dispatch_total')
    const point = points.find(
      (p) => p.attributes['kind'] === 'disambiguation' && p.attributes['outcome'] === 'error',
    )
    expect(point!.value).toBe(3)
  })
})

// ─── recordBoundedExecutorPhaseDuration ───────────────────────────────────────

describe('recordBoundedExecutorPhaseDuration', () => {
  it('records the duration into agent_bounded_executor_phase_duration_ms histogram', async () => {
    // Unique label set (phase-2 + errored) reserved for this test only.
    recordBoundedExecutorPhaseDuration({
      phase: 'phase-2',
      outcome: 'errored',
      durationMs: 1234,
    })

    const points = await flushAndGetPoints('agent_bounded_executor_phase_duration_ms')
    const point = points.find(
      (p) => p.attributes['phase'] === 'phase-2' && p.attributes['outcome'] === 'errored',
    )
    expect(point).toBeDefined()
    expect(point!.sum).toBe(1234)
    expect(point!.count).toBe(1)
  })

  it.each<{
    phase: 'phase-1' | 'phase-2'
    outcome: 'completed' | 'cancelled' | 'errored'
  }>([
    { phase: 'phase-1', outcome: 'cancelled' },
    { phase: 'phase-1', outcome: 'errored' },
    { phase: 'phase-2', outcome: 'cancelled' },
  ])('records phase=$phase outcome=$outcome with matching attrs', async ({ phase, outcome }) => {
    recordBoundedExecutorPhaseDuration({ phase, outcome, durationMs: 42 })

    const points = await flushAndGetPoints('agent_bounded_executor_phase_duration_ms')
    const point = points.find(
      (p) => p.attributes['phase'] === phase && p.attributes['outcome'] === outcome,
    )
    expect(point).toBeDefined()
    expect(point!.sum).toBe(42)
    expect(point!.count).toBe(1)
  })

  it('aggregates multiple recordings under the same labels', async () => {
    // Reserve phase-1/completed and phase-2/completed exclusively for accumulation tests.
    recordBoundedExecutorPhaseDuration({
      phase: 'phase-1',
      outcome: 'completed',
      durationMs: 100,
    })
    recordBoundedExecutorPhaseDuration({
      phase: 'phase-1',
      outcome: 'completed',
      durationMs: 250,
    })

    const points = await flushAndGetPoints('agent_bounded_executor_phase_duration_ms')
    const point = points.find(
      (p) => p.attributes['phase'] === 'phase-1' && p.attributes['outcome'] === 'completed',
    )
    expect(point!.sum).toBe(350)
    expect(point!.count).toBe(2)
  })
})

// ─── recordBoundedExecutorDrafts ──────────────────────────────────────────────

describe('recordBoundedExecutorDrafts', () => {
  it('increments agent_bounded_executor_drafts_total by count with phase + sub_agent_key', async () => {
    recordBoundedExecutorDrafts({ phase: 'phase-1', subAgentKey: 'sa1', count: 3 })

    const points = await flushAndGetPoints('agent_bounded_executor_drafts_total')
    const point = points.find(
      (p) => p.attributes['phase'] === 'phase-1' && p.attributes['sub_agent_key'] === 'sa1',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(3)
  })

  it('accumulates across calls with identical labels', async () => {
    recordBoundedExecutorDrafts({ phase: 'phase-2', subAgentKey: 'sa1', count: 2 })
    recordBoundedExecutorDrafts({ phase: 'phase-2', subAgentKey: 'sa1', count: 5 })

    const points = await flushAndGetPoints('agent_bounded_executor_drafts_total')
    const point = points.find(
      (p) => p.attributes['phase'] === 'phase-2' && p.attributes['sub_agent_key'] === 'sa1',
    )
    expect(point!.value).toBe(7)
  })

  it('is a no-op when count <= 0', async () => {
    recordBoundedExecutorDrafts({ phase: 'phase-1', subAgentKey: 'sa-zero', count: 0 })
    recordBoundedExecutorDrafts({ phase: 'phase-1', subAgentKey: 'sa-neg', count: -3 })

    const points = await flushAndGetPoints('agent_bounded_executor_drafts_total')
    const zero = points.find((p) => p.attributes['sub_agent_key'] === 'sa-zero')
    const neg = points.find((p) => p.attributes['sub_agent_key'] === 'sa-neg')
    expect(zero).toBeUndefined()
    expect(neg).toBeUndefined()
  })
})

// ─── __INTERNAL_resetInstruments ──────────────────────────────────────────────

describe('__INTERNAL_resetInstruments', () => {
  it('drops cached instruments so the next call re-acquires them', async () => {
    // Unique label set so other tests don't pre-populate this datapoint.
    recordPipelineDispatch({ kind: 'iterative', outcome: 'completed' })

    __INTERNAL_resetInstruments()
    recordPipelineDispatch({ kind: 'iterative', outcome: 'completed' })

    const points = await flushAndGetPoints('agent_pipeline_dispatch_total')
    const point = points.find(
      (p) => p.attributes['kind'] === 'iterative' && p.attributes['outcome'] === 'completed',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(2)
  })
})
