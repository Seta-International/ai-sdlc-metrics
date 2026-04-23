import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PricingResolver } from './pricing-resolver'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MODEL_ID = 'gpt-5.4'

function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
    modelId: MODEL_ID,
    inputUsdPerMtok: '2.5000',
    inputCachedReadUsdPerMtok: '1.2500',
    inputCachedWriteUsdPerMtok: '3.7500',
    outputUsdPerMtok: '10.0000',
    outputReasoningUsdPerMtok: '12.0000',
    effectiveFrom: new Date('2025-01-01T00:00:00Z'),
    effectiveUntil: null,
    ...overrides,
  }
}

// ── DB mock builder ────────────────────────────────────────────────────────────

function buildDbMock(rows: unknown[]) {
  const limitFn = vi.fn().mockResolvedValue(rows)
  const orderByFn = vi.fn().mockReturnValue({ limit: limitFn })
  const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn })
  const fromFn = vi.fn().mockReturnValue({ where: whereFn })
  const selectFn = vi.fn().mockReturnValue({ from: fromFn })
  return { db: { select: selectFn }, selectFn, limitFn }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PricingResolver', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('resolves pricing for current time', async () => {
    const { db } = buildDbMock([makeRow()])
    const resolver = new PricingResolver(db as never)

    const pricing = await resolver.resolve({ modelId: MODEL_ID })

    expect(pricing.modelId).toBe(MODEL_ID)
    expect(pricing.pricingId).toBe('aaaaaaaa-0000-0000-0000-000000000001')
    expect(pricing.inputUsdPerMtok).toBe(2.5)
    expect(pricing.outputUsdPerMtok).toBe(10)
    expect(pricing.effectiveFrom).toEqual(new Date('2025-01-01T00:00:00Z'))
  })

  it('resolves historical pricing when `at` is in the past', async () => {
    const historicalRow = makeRow({
      id: 'bbbbbbbb-0000-0000-0000-000000000002',
      effectiveFrom: new Date('2024-01-01T00:00:00Z'),
      effectiveUntil: new Date('2025-01-01T00:00:00Z'),
      inputUsdPerMtok: '1.0000',
    })
    const { db } = buildDbMock([historicalRow])
    const resolver = new PricingResolver(db as never)

    const pricing = await resolver.resolve({
      modelId: MODEL_ID,
      at: new Date('2024-06-01T00:00:00Z'),
    })

    expect(pricing.pricingId).toBe('bbbbbbbb-0000-0000-0000-000000000002')
    expect(pricing.inputUsdPerMtok).toBe(1.0)
  })

  it('throws if no pricing row is found', async () => {
    const { db } = buildDbMock([])
    const resolver = new PricingResolver(db as never)

    await expect(resolver.resolve({ modelId: 'unknown-model' })).rejects.toThrow(
      /No pricing found for model unknown-model/,
    )
  })

  it('returns cached result on second call (db.select called only once)', async () => {
    const { db, selectFn } = buildDbMock([makeRow()])
    const resolver = new PricingResolver(db as never)

    await resolver.resolve({ modelId: MODEL_ID })
    await resolver.resolve({ modelId: MODEL_ID })

    expect(selectFn).toHaveBeenCalledTimes(1)
  })

  it('bypasses cache after TTL expires', async () => {
    const { db, selectFn } = buildDbMock([makeRow(), makeRow()])
    const resolver = new PricingResolver(db as never)

    await resolver.resolve({ modelId: MODEL_ID })
    // Advance past the 60s TTL
    vi.advanceTimersByTime(61_000)
    await resolver.resolve({ modelId: MODEL_ID })

    expect(selectFn).toHaveBeenCalledTimes(2)
  })

  it('serves cache hit within TTL', async () => {
    const { db, selectFn } = buildDbMock([makeRow()])
    const resolver = new PricingResolver(db as never)

    await resolver.resolve({ modelId: MODEL_ID })
    vi.advanceTimersByTime(59_000) // still within TTL
    await resolver.resolve({ modelId: MODEL_ID })

    expect(selectFn).toHaveBeenCalledTimes(1)
  })
})
