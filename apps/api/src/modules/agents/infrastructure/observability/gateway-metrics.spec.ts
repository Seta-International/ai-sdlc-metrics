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
  recordSubAgentHidden,
  recordIterativeTurnTotal,
  recordIterationCountExceeded,
  recordTopologyDowngradeCandidateTotal,
  recordReplanLlmCallTotal,
  recordCompletionScorerFail,
  recordIterationsTotalHistogram,
  __INTERNAL_resetInstruments,
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
  __INTERNAL_resetInstruments()
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

describe('recordSubAgentHidden', () => {
  it('increments agent_sub_agent_hidden_total for reason=module_disabled', async () => {
    recordSubAgentHidden('tenant-sa-1', 'module_disabled')

    const points = await flushAndGetPoints('agent_sub_agent_hidden_total')
    const point = points.find(
      (p) =>
        p.attributes['tenant_id'] === 'tenant-sa-1' && p.attributes['reason'] === 'module_disabled',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })

  it('increments agent_sub_agent_hidden_total for reason=permission_empty_scope', async () => {
    recordSubAgentHidden('tenant-sa-2', 'permission_empty_scope')

    const points = await flushAndGetPoints('agent_sub_agent_hidden_total')
    const point = points.find(
      (p) =>
        p.attributes['tenant_id'] === 'tenant-sa-2' &&
        p.attributes['reason'] === 'permission_empty_scope',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })

  it('label set is exactly {tenant_id, reason} — no sub_agent_key or other extras', async () => {
    recordSubAgentHidden('tenant-sa-3', 'module_disabled')

    const points = await flushAndGetPoints('agent_sub_agent_hidden_total')
    const point = points.find((p) => p.attributes['tenant_id'] === 'tenant-sa-3')
    expect(point).toBeDefined()
    const labelKeys = Object.keys(point!.attributes)
    expect(labelKeys).toHaveLength(2)
    expect(labelKeys).toContain('tenant_id')
    expect(labelKeys).toContain('reason')
    expect(labelKeys).not.toContain('sub_agent_key')
  })

  it('is idempotent across multiple calls — counter accumulates correctly', async () => {
    recordSubAgentHidden('tenant-sa-4', 'permission_empty_scope')
    recordSubAgentHidden('tenant-sa-4', 'permission_empty_scope')
    recordSubAgentHidden('tenant-sa-4', 'permission_empty_scope')

    const points = await flushAndGetPoints('agent_sub_agent_hidden_total')
    const point = points.find(
      (p) =>
        p.attributes['tenant_id'] === 'tenant-sa-4' &&
        p.attributes['reason'] === 'permission_empty_scope',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(3)
  })
})

// ─── Plan 12 §8 iterative-topology metrics ────────────────────────────────────

describe('recordIterativeTurnTotal', () => {
  it('increments agent_iterative_turn_total with tenant_id and outcome=synthesized', async () => {
    recordIterativeTurnTotal('tenant-it-1', 'synthesized')

    const points = await flushAndGetPoints('agent_iterative_turn_total')
    const point = points.find(
      (p) =>
        p.attributes['tenant_id'] === 'tenant-it-1' && p.attributes['outcome'] === 'synthesized',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })

  it('increments agent_iterative_turn_total with outcome=partial', async () => {
    recordIterativeTurnTotal('tenant-it-2', 'partial')

    const points = await flushAndGetPoints('agent_iterative_turn_total')
    const point = points.find(
      (p) => p.attributes['tenant_id'] === 'tenant-it-2' && p.attributes['outcome'] === 'partial',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })

  it('increments agent_iterative_turn_total with outcome=aborted', async () => {
    recordIterativeTurnTotal('tenant-it-3', 'aborted')

    const points = await flushAndGetPoints('agent_iterative_turn_total')
    const point = points.find(
      (p) => p.attributes['tenant_id'] === 'tenant-it-3' && p.attributes['outcome'] === 'aborted',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })

  it('increments agent_iterative_turn_total with outcome=disambiguation', async () => {
    recordIterativeTurnTotal('tenant-it-4', 'disambiguation')

    const points = await flushAndGetPoints('agent_iterative_turn_total')
    const point = points.find(
      (p) =>
        p.attributes['tenant_id'] === 'tenant-it-4' && p.attributes['outcome'] === 'disambiguation',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })

  it('accumulates count across multiple calls for the same labels', async () => {
    recordIterativeTurnTotal('tenant-it-acc', 'synthesized')
    recordIterativeTurnTotal('tenant-it-acc', 'synthesized')

    const points = await flushAndGetPoints('agent_iterative_turn_total')
    const point = points.find(
      (p) =>
        p.attributes['tenant_id'] === 'tenant-it-acc' && p.attributes['outcome'] === 'synthesized',
    )
    expect(point?.value).toBe(2)
  })
})

describe('recordIterationCountExceeded', () => {
  it('records agent_iteration_count_exceeded_p95 gauge with tenant_id', async () => {
    recordIterationCountExceeded('tenant-ice-1')

    const points = await flushAndGetPoints('agent_iteration_count_exceeded_p95')
    const point = points.find((p) => p.attributes['tenant_id'] === 'tenant-ice-1')
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })
})

describe('recordTopologyDowngradeCandidateTotal', () => {
  it('increments agent_topology_downgrade_candidate_total with tenant_id', async () => {
    recordTopologyDowngradeCandidateTotal('tenant-tdc-1')

    const points = await flushAndGetPoints('agent_topology_downgrade_candidate_total')
    const point = points.find((p) => p.attributes['tenant_id'] === 'tenant-tdc-1')
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })

  it('accumulates across multiple calls', async () => {
    recordTopologyDowngradeCandidateTotal('tenant-tdc-2')
    recordTopologyDowngradeCandidateTotal('tenant-tdc-2')

    const points = await flushAndGetPoints('agent_topology_downgrade_candidate_total')
    const point = points.find((p) => p.attributes['tenant_id'] === 'tenant-tdc-2')
    expect(point?.value).toBe(2)
  })
})

describe('recordReplanLlmCallTotal', () => {
  const outcomes = [
    'continue',
    'exit_complete',
    'exit_stuck',
    'exit_disambiguation',
    'parse_error',
  ] as const

  for (const outcome of outcomes) {
    it(`increments agent_replan_llm_call_total with outcome=${outcome}`, async () => {
      recordReplanLlmCallTotal(`tenant-rpl-${outcome}`, outcome)

      const points = await flushAndGetPoints('agent_replan_llm_call_total')
      const point = points.find(
        (p) =>
          p.attributes['tenant_id'] === `tenant-rpl-${outcome}` &&
          p.attributes['outcome'] === outcome,
      )
      expect(point).toBeDefined()
      expect(point!.value).toBe(1)
    })
  }
})

describe('recordCompletionScorerFail', () => {
  it('increments agent_completion_scorer_fail_total with tenant_id and scorer_id', async () => {
    recordCompletionScorerFail('tenant-csf-1', 'scorer-threshold')

    const points = await flushAndGetPoints('agent_completion_scorer_fail_total')
    const point = points.find(
      (p) =>
        p.attributes['tenant_id'] === 'tenant-csf-1' &&
        p.attributes['scorer_id'] === 'scorer-threshold',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })

  it('label set is exactly {tenant_id, scorer_id}', async () => {
    recordCompletionScorerFail('tenant-csf-2', 'scorer-regex')

    const points = await flushAndGetPoints('agent_completion_scorer_fail_total')
    const point = points.find((p) => p.attributes['tenant_id'] === 'tenant-csf-2')
    expect(point).toBeDefined()
    const keys = Object.keys(point!.attributes)
    expect(keys).toHaveLength(2)
    expect(keys).toContain('tenant_id')
    expect(keys).toContain('scorer_id')
  })
})

describe('recordIterationsTotalHistogram', () => {
  it('records agent_iterations_total histogram with tenant_id and iteration count', async () => {
    recordIterationsTotalHistogram('tenant-ith-1', 5)

    const points = await flushAndGetPoints('agent_iterations_total')
    const point = points.find((p) => p.attributes['tenant_id'] === 'tenant-ith-1')
    expect(point).toBeDefined()
    // flushAndGetPoints returns histogram sum — 5 in a single record
    expect(point!.value).toBe(5)
  })

  it('accumulates sum across multiple records', async () => {
    recordIterationsTotalHistogram('tenant-ith-2', 3)
    recordIterationsTotalHistogram('tenant-ith-2', 7)

    const points = await flushAndGetPoints('agent_iterations_total')
    const point = points.find((p) => p.attributes['tenant_id'] === 'tenant-ith-2')
    expect(point).toBeDefined()
    expect(point!.value).toBe(10)
  })
})
