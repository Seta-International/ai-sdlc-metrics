/**
 * cost-metrics.spec.ts — Plan 05 §8 cost / budget / rate-limit instruments.
 *
 * Verifies that each helper function records the correct metric name, type,
 * value, and label set. Follows the same OTel SDK in-memory test pattern as
 * gateway-metrics.spec.ts and observability-metrics.spec.ts.
 *
 * OTel API v2: setGlobalMeterProvider may only be called once per process.
 * We register once at module load time and reset the exporter between tests.
 *
 * ── Instruments under test (Plan 05 §8) ──────────────────────────────────────
 *
 * agent_cost_usd_total{tenant_id, layer, model_id, pricing_id}           counter
 * agent_budget_remaining_usd{tenant_id}                                   observable gauge
 * agent_tier_shift_total{tenant_id, from_tier, to_tier, reason}           counter
 * agent_provider_fallback_total{tenant_id, model_id, error_class}         counter
 * agent_llm_call_attempt_duration_ms{tenant_id, model_id, layer}          histogram
 * agent_llm_call_total_duration_ms{tenant_id, model_id, layer}            histogram
 * agent_vendor_retry_total{tenant_id, model_id, error_class}              counter
 * agent_rate_limit_rejected_total{tenant_id, limit_key}                   counter
 * agent_adapter_drop_total{adapter, field}                                counter
 * agent_approval_inbox_depth{tenant_id}                                   observable gauge
 * agent_budget_refill_total{tenant_id, source}                            counter
 * agent_ladder_step_total{tenant_id, step, trace_tag}                     counter
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
  recordCostUsd,
  setBudgetRemaining,
  recordTierShift,
  recordProviderFallback,
  recordLlmCallAttemptDuration,
  recordLlmCallTotalDuration,
  recordVendorRetry,
  recordRateLimitRejected,
  recordAdapterDrop,
  setApprovalInboxDepth,
  recordBudgetRefill,
  recordLadderStep,
  __INTERNAL_resetInstruments,
} from './cost-metrics'

// ─── One-time OTel meter provider setup ──────────────────────────────────────
//
// Each spec file may register at most one MeterProvider for the process.
// cost-metrics.spec.ts uses its own meter name ('agents.cost') so it does not
// collide with the existing providers registered in gateway-metrics.spec.ts
// and observability-metrics.spec.ts.
//
// We rely on vitest running spec files in isolated worker processes (default),
// which means each spec file gets its own module registry and therefore its own
// setGlobalMeterProvider call.

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

// ─── agent_cost_usd_total ─────────────────────────────────────────────────────

describe('recordCostUsd', () => {
  it('increments agent_cost_usd_total with tenant_id, layer, model_id, pricing_id labels', async () => {
    recordCostUsd('tenant-a', 'router', 'gpt-5.4', 'pricing-uuid-1', 0.0012)

    const points = await flushAndGetPoints('agent_cost_usd_total')
    expect(points.length).toBeGreaterThan(0)

    const point = points.find(
      (p) =>
        p.attributes['tenant_id'] === 'tenant-a' &&
        p.attributes['layer'] === 'router' &&
        p.attributes['model_id'] === 'gpt-5.4' &&
        p.attributes['pricing_id'] === 'pricing-uuid-1',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBeCloseTo(0.0012)
  })

  it('accumulates cost across multiple calls for the same labels', async () => {
    recordCostUsd('tenant-b', 'synthesizer', 'gpt-5.4', 'pricing-uuid-2', 0.001)
    recordCostUsd('tenant-b', 'synthesizer', 'gpt-5.4', 'pricing-uuid-2', 0.002)

    const points = await flushAndGetPoints('agent_cost_usd_total')
    const point = points.find(
      (p) => p.attributes['tenant_id'] === 'tenant-b' && p.attributes['layer'] === 'synthesizer',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBeCloseTo(0.003)
  })

  it('R-05.30: does NOT carry user_id label (cardinality guardrail)', async () => {
    recordCostUsd('tenant-c', 'router', 'gpt-5.4-nano', 'pricing-uuid-3', 0.0005)

    const points = await flushAndGetPoints('agent_cost_usd_total')
    const point = points.find((p) => p.attributes['tenant_id'] === 'tenant-c')
    expect(point).toBeDefined()
    expect('user_id' in point!.attributes).toBe(false)
  })
})

// ─── agent_budget_remaining_usd ───────────────────────────────────────────────

describe('setBudgetRemaining', () => {
  it('reports agent_budget_remaining_usd gauge with tenant_id label', async () => {
    setBudgetRemaining('tenant-br-1', 42.5)

    const points = await flushAndGetPoints('agent_budget_remaining_usd')
    const point = points.find((p) => p.attributes['tenant_id'] === 'tenant-br-1')
    expect(point).toBeDefined()
    expect(point!.value).toBeCloseTo(42.5)
  })

  it('updates gauge when called twice for the same tenant', async () => {
    setBudgetRemaining('tenant-br-2', 100.0)
    await flushAndGetPoints('agent_budget_remaining_usd')
    exporter.reset()

    setBudgetRemaining('tenant-br-2', 55.0)
    const points = await flushAndGetPoints('agent_budget_remaining_usd')
    const point = points.find((p) => p.attributes['tenant_id'] === 'tenant-br-2')
    expect(point).toBeDefined()
    expect(point!.value).toBeCloseTo(55.0)
  })

  it('tracks multiple tenants independently', async () => {
    setBudgetRemaining('tenant-br-x', 10.0)
    setBudgetRemaining('tenant-br-y', 90.0)

    const points = await flushAndGetPoints('agent_budget_remaining_usd')
    const px = points.find((p) => p.attributes['tenant_id'] === 'tenant-br-x')
    const py = points.find((p) => p.attributes['tenant_id'] === 'tenant-br-y')
    expect(px?.value).toBeCloseTo(10.0)
    expect(py?.value).toBeCloseTo(90.0)
  })
})

// ─── agent_tier_shift_total ───────────────────────────────────────────────────

describe('recordTierShift', () => {
  it('increments agent_tier_shift_total with tenant_id, from_tier, to_tier, reason labels', async () => {
    recordTierShift('tenant-ts-1', 'full', 'nano', 'budget')

    const points = await flushAndGetPoints('agent_tier_shift_total')
    const point = points.find(
      (p) =>
        p.attributes['tenant_id'] === 'tenant-ts-1' &&
        p.attributes['from_tier'] === 'full' &&
        p.attributes['to_tier'] === 'nano' &&
        p.attributes['reason'] === 'budget',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })

  it('records reason=quality_canary', async () => {
    recordTierShift('tenant-ts-2', 'full', 'nano', 'quality_canary')

    const points = await flushAndGetPoints('agent_tier_shift_total')
    const point = points.find(
      (p) =>
        p.attributes['tenant_id'] === 'tenant-ts-2' && p.attributes['reason'] === 'quality_canary',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })

  it('accumulates across multiple tier shifts', async () => {
    recordTierShift('tenant-ts-3', 'full', 'nano', 'budget')
    recordTierShift('tenant-ts-3', 'full', 'nano', 'budget')

    const points = await flushAndGetPoints('agent_tier_shift_total')
    const point = points.find(
      (p) => p.attributes['tenant_id'] === 'tenant-ts-3' && p.attributes['reason'] === 'budget',
    )
    expect(point?.value).toBe(2)
  })
})

// ─── agent_provider_fallback_total ────────────────────────────────────────────

describe('recordProviderFallback', () => {
  const errorClasses = [
    'vendor_rate_limit',
    'vendor_overload',
    'vendor_server_error',
    'vendor_timeout',
    'vendor_invalid_response',
  ] as const

  for (const errorClass of errorClasses) {
    it(`increments agent_provider_fallback_total with error_class=${errorClass}`, async () => {
      recordProviderFallback(`tenant-pf-${errorClass}`, 'gpt-5.4', errorClass)

      const points = await flushAndGetPoints('agent_provider_fallback_total')
      const point = points.find(
        (p) =>
          p.attributes['tenant_id'] === `tenant-pf-${errorClass}` &&
          p.attributes['model_id'] === 'gpt-5.4' &&
          p.attributes['error_class'] === errorClass,
      )
      expect(point).toBeDefined()
      expect(point!.value).toBe(1)
    })
  }
})

// ─── agent_llm_call_attempt_duration_ms ──────────────────────────────────────

describe('recordLlmCallAttemptDuration', () => {
  it('records agent_llm_call_attempt_duration_ms histogram with tenant_id, model_id, layer', async () => {
    recordLlmCallAttemptDuration('tenant-lcd-1', 'gpt-5.4', 'router', 350)

    const points = await flushAndGetPoints('agent_llm_call_attempt_duration_ms')
    const point = points.find(
      (p) =>
        p.attributes['tenant_id'] === 'tenant-lcd-1' &&
        p.attributes['model_id'] === 'gpt-5.4' &&
        p.attributes['layer'] === 'router',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(350)
  })

  it('accumulates sum across multiple recordings', async () => {
    recordLlmCallAttemptDuration('tenant-lcd-2', 'gpt-5.4-nano', 'synthesizer', 100)
    recordLlmCallAttemptDuration('tenant-lcd-2', 'gpt-5.4-nano', 'synthesizer', 200)

    const points = await flushAndGetPoints('agent_llm_call_attempt_duration_ms')
    const point = points.find(
      (p) =>
        p.attributes['tenant_id'] === 'tenant-lcd-2' && p.attributes['layer'] === 'synthesizer',
    )
    expect(point?.value).toBe(300)
  })

  it('R-05.30: does NOT carry user_id label', async () => {
    recordLlmCallAttemptDuration('tenant-lcd-3', 'gpt-5.4', 'router', 50)

    const points = await flushAndGetPoints('agent_llm_call_attempt_duration_ms')
    const point = points.find((p) => p.attributes['tenant_id'] === 'tenant-lcd-3')
    expect(point).toBeDefined()
    expect('user_id' in point!.attributes).toBe(false)
  })
})

// ─── agent_llm_call_total_duration_ms ────────────────────────────────────────

describe('recordLlmCallTotalDuration', () => {
  it('records agent_llm_call_total_duration_ms histogram with tenant_id, model_id, layer', async () => {
    recordLlmCallTotalDuration('tenant-ltd-1', 'gpt-5.4', 'sub_agent:hiring', 700)

    const points = await flushAndGetPoints('agent_llm_call_total_duration_ms')
    const point = points.find(
      (p) =>
        p.attributes['tenant_id'] === 'tenant-ltd-1' &&
        p.attributes['layer'] === 'sub_agent:hiring',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(700)
  })
})

// ─── agent_vendor_retry_total ─────────────────────────────────────────────────

describe('recordVendorRetry', () => {
  it('increments agent_vendor_retry_total with tenant_id, model_id, error_class labels', async () => {
    recordVendorRetry('tenant-vr-1', 'gpt-5.4', 'vendor_overload')

    const points = await flushAndGetPoints('agent_vendor_retry_total')
    const point = points.find(
      (p) =>
        p.attributes['tenant_id'] === 'tenant-vr-1' &&
        p.attributes['model_id'] === 'gpt-5.4' &&
        p.attributes['error_class'] === 'vendor_overload',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })
})

// ─── agent_rate_limit_rejected_total ─────────────────────────────────────────

describe('recordRateLimitRejected', () => {
  it('increments agent_rate_limit_rejected_total with tenant_id and limit_key labels', async () => {
    recordRateLimitRejected('tenant-rl-1', 'queries/user/min')

    const points = await flushAndGetPoints('agent_rate_limit_rejected_total')
    const point = points.find(
      (p) =>
        p.attributes['tenant_id'] === 'tenant-rl-1' &&
        p.attributes['limit_key'] === 'queries/user/min',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })

  it('records l3_writes/user/day limit_key', async () => {
    recordRateLimitRejected('tenant-rl-2', 'l3_writes/user/day')

    const points = await flushAndGetPoints('agent_rate_limit_rejected_total')
    const point = points.find(
      (p) =>
        p.attributes['tenant_id'] === 'tenant-rl-2' &&
        p.attributes['limit_key'] === 'l3_writes/user/day',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })

  it('accumulates rejections', async () => {
    recordRateLimitRejected('tenant-rl-3', 'queries/user/min')
    recordRateLimitRejected('tenant-rl-3', 'queries/user/min')
    recordRateLimitRejected('tenant-rl-3', 'queries/user/min')

    const points = await flushAndGetPoints('agent_rate_limit_rejected_total')
    const point = points.find(
      (p) =>
        p.attributes['tenant_id'] === 'tenant-rl-3' &&
        p.attributes['limit_key'] === 'queries/user/min',
    )
    expect(point?.value).toBe(3)
  })

  it('R-05.30: does NOT carry user_id label', async () => {
    recordRateLimitRejected('tenant-rl-4', 'queries/user/min')

    const points = await flushAndGetPoints('agent_rate_limit_rejected_total')
    const point = points.find((p) => p.attributes['tenant_id'] === 'tenant-rl-4')
    expect(point).toBeDefined()
    expect('user_id' in point!.attributes).toBe(false)
  })
})

// ─── agent_adapter_drop_total ─────────────────────────────────────────────────

describe('recordAdapterDrop', () => {
  it('increments agent_adapter_drop_total with adapter and field labels', async () => {
    recordAdapterDrop('openai-v4', 'cachedInputTokens')

    const points = await flushAndGetPoints('agent_adapter_drop_total')
    const point = points.find(
      (p) =>
        p.attributes['adapter'] === 'openai-v4' && p.attributes['field'] === 'cachedInputTokens',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })

  it('no tenant_id label (P1 alert on any positive — adapter-level signal)', async () => {
    recordAdapterDrop('openai-v5', 'cachedWriteTokens')

    const points = await flushAndGetPoints('agent_adapter_drop_total')
    const point = points.find((p) => p.attributes['adapter'] === 'openai-v5')
    expect(point).toBeDefined()
    expect('tenant_id' in point!.attributes).toBe(false)
  })
})

// ─── agent_approval_inbox_depth ───────────────────────────────────────────────

describe('setApprovalInboxDepth', () => {
  it('reports agent_approval_inbox_depth gauge with tenant_id label', async () => {
    setApprovalInboxDepth('tenant-aid-1', 12)

    const points = await flushAndGetPoints('agent_approval_inbox_depth')
    const point = points.find((p) => p.attributes['tenant_id'] === 'tenant-aid-1')
    expect(point).toBeDefined()
    expect(point!.value).toBe(12)
  })

  it('updates gauge when called multiple times', async () => {
    setApprovalInboxDepth('tenant-aid-2', 5)
    await flushAndGetPoints('agent_approval_inbox_depth')
    exporter.reset()

    setApprovalInboxDepth('tenant-aid-2', 30)
    const points = await flushAndGetPoints('agent_approval_inbox_depth')
    const point = points.find((p) => p.attributes['tenant_id'] === 'tenant-aid-2')
    expect(point?.value).toBe(30)
  })
})

// ─── agent_budget_refill_total ───────────────────────────────────────────────

describe('recordBudgetRefill', () => {
  it('increments agent_budget_refill_total with tenant_id and source=midnight', async () => {
    recordBudgetRefill('tenant-brf-1', 'midnight')

    const points = await flushAndGetPoints('agent_budget_refill_total')
    const point = points.find(
      (p) => p.attributes['tenant_id'] === 'tenant-brf-1' && p.attributes['source'] === 'midnight',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })

  it('increments agent_budget_refill_total with source=admin_topup', async () => {
    recordBudgetRefill('tenant-brf-2', 'admin_topup')

    const points = await flushAndGetPoints('agent_budget_refill_total')
    const point = points.find(
      (p) =>
        p.attributes['tenant_id'] === 'tenant-brf-2' && p.attributes['source'] === 'admin_topup',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })
})

// ─── agent_ladder_step_total ──────────────────────────────────────────────────

describe('recordLadderStep', () => {
  it('increments agent_ladder_step_total with tenant_id, step, trace_tag labels', async () => {
    recordLadderStep('tenant-ls-1', 2, 'provider_fallback')

    const points = await flushAndGetPoints('agent_ladder_step_total')
    const point = points.find(
      (p) =>
        p.attributes['tenant_id'] === 'tenant-ls-1' &&
        p.attributes['step'] === 2 &&
        p.attributes['trace_tag'] === 'provider_fallback',
    )
    expect(point).toBeDefined()
    expect(point!.value).toBe(1)
  })

  it('records all valid trace_tag values', async () => {
    const traceTags = [
      'provider_retry',
      'provider_fallback',
      'provider_outage',
      'tier_shift',
      'refused',
    ] as const

    for (const tag of traceTags) {
      recordLadderStep(`tenant-ls-tag-${tag}`, 1, tag)
    }

    const points = await flushAndGetPoints('agent_ladder_step_total')
    for (const tag of traceTags) {
      const point = points.find(
        (p) =>
          p.attributes['tenant_id'] === `tenant-ls-tag-${tag}` && p.attributes['trace_tag'] === tag,
      )
      expect(point).toBeDefined()
    }
  })

  it('accumulates across multiple steps', async () => {
    recordLadderStep('tenant-ls-2', 1, 'provider_retry')
    recordLadderStep('tenant-ls-2', 1, 'provider_retry')

    const points = await flushAndGetPoints('agent_ladder_step_total')
    const point = points.find(
      (p) => p.attributes['tenant_id'] === 'tenant-ls-2' && p.attributes['step'] === 1,
    )
    expect(point?.value).toBe(2)
  })
})
