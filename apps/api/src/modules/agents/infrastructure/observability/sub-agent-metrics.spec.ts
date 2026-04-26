/**
 * sub-agent-metrics.spec.ts — Plan 17 PR 2 Task 7
 *
 * OTel SDK in-memory verification for the sub-agent ReAct loop counters:
 *
 *   agent_sub_agent_iterations_total{sub_agent_key, outcome}     counter
 *   agent_sub_agent_tool_failures_total{sub_agent_key, tool_name,
 *     tripwire_kind, severity}                                    counter
 *
 * Mirrors the test pattern in cost-metrics.spec.ts: register one
 * MeterProvider per spec file (vitest isolates spec files in workers),
 * reset the in-memory exporter and the lazy instrument cache between
 * tests via __INTERNAL_resetInstruments.
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
  recordSubAgentIteration,
  recordSubAgentToolFailure,
  __INTERNAL_resetInstruments,
} from './sub-agent-metrics'

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

// ─── recordSubAgentIteration ──────────────────────────────────────────────────

describe('recordSubAgentIteration', () => {
  it('increments agent_sub_agent_iterations_total with sub_agent_key + outcome=completed', async () => {
    recordSubAgentIteration({ subAgentKey: 'goals.analyst', outcome: 'completed' })

    const points = await flushAndGetPoints('agent_sub_agent_iterations_total')
    const point = points.find(
      (p) =>
        p.attributes['sub_agent_key'] === 'goals.analyst' &&
        p.attributes['outcome'] === 'completed',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })

  it('records each of the four real outcomes independently', async () => {
    recordSubAgentIteration({ subAgentKey: 'k1', outcome: 'completed' })
    recordSubAgentIteration({ subAgentKey: 'k1', outcome: 'ceiling_hit' })
    recordSubAgentIteration({ subAgentKey: 'k1', outcome: 'errored' })
    recordSubAgentIteration({ subAgentKey: 'k1', outcome: 'aborted' })

    const points = await flushAndGetPoints('agent_sub_agent_iterations_total')
    for (const outcome of ['completed', 'ceiling_hit', 'errored', 'aborted']) {
      const point = points.find(
        (p) => p.attributes['sub_agent_key'] === 'k1' && p.attributes['outcome'] === outcome,
      )
      expect(point, `missing outcome=${outcome}`).toBeDefined()
      expect(point!.value).toBe(1)
    }
  })

  it('accumulates across calls with identical labels', async () => {
    recordSubAgentIteration({ subAgentKey: 'accumulate.test', outcome: 'completed' })
    recordSubAgentIteration({ subAgentKey: 'accumulate.test', outcome: 'completed' })

    const points = await flushAndGetPoints('agent_sub_agent_iterations_total')
    const point = points.find(
      (p) =>
        p.attributes['sub_agent_key'] === 'accumulate.test' &&
        p.attributes['outcome'] === 'completed',
    )
    expect(point!.value).toBe(2)
  })
})

// ─── recordSubAgentToolFailure ────────────────────────────────────────────────

describe('recordSubAgentToolFailure', () => {
  it('increments agent_sub_agent_tool_failures_total for soft tripwires with all four labels', async () => {
    recordSubAgentToolFailure({
      subAgentKey: 'goals.analyst',
      toolName: 'goals.getKpi',
      tripwireKind: 'validation_failed',
      severity: 'soft',
    })

    const points = await flushAndGetPoints('agent_sub_agent_tool_failures_total')
    const point = points.find(
      (p) =>
        p.attributes['sub_agent_key'] === 'goals.analyst' &&
        p.attributes['tool_name'] === 'goals.getKpi' &&
        p.attributes['tripwire_kind'] === 'validation_failed' &&
        p.attributes['severity'] === 'soft',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })

  it('records hard tripwires under severity=hard', async () => {
    recordSubAgentToolFailure({
      subAgentKey: 'goals.analyst',
      toolName: 'goals.getKpi',
      tripwireKind: 'permission_denied',
      severity: 'hard',
    })

    const points = await flushAndGetPoints('agent_sub_agent_tool_failures_total')
    const point = points.find(
      (p) =>
        p.attributes['severity'] === 'hard' &&
        p.attributes['tripwire_kind'] === 'permission_denied',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })

  it('partitions soft and hard severities for the same key/tool/variant', async () => {
    recordSubAgentToolFailure({
      subAgentKey: 'k1',
      toolName: 't1',
      tripwireKind: 'infra_error',
      severity: 'soft',
    })
    recordSubAgentToolFailure({
      subAgentKey: 'k1',
      toolName: 't1',
      tripwireKind: 'infra_error',
      severity: 'hard',
    })

    const points = await flushAndGetPoints('agent_sub_agent_tool_failures_total')
    const soft = points.find((p) => p.attributes['severity'] === 'soft')
    const hard = points.find((p) => p.attributes['severity'] === 'hard')
    expect(soft!.value).toBe(1)
    expect(hard!.value).toBe(1)
  })
})
