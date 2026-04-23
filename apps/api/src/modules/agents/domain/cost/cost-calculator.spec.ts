import { describe, it, expect } from 'vitest'
import { CostCalculator } from './cost-calculator'
import { EMPTY_USAGE } from './cost-types'
import type { Pricing } from './cost-types'

const basePricing: Pricing = {
  pricingId: 'aaaaaaaa-0000-0000-0000-000000000001',
  modelId: 'gpt-5.4',
  inputUsdPerMtok: 2.5,
  inputCachedReadUsdPerMtok: 1.25,
  inputCachedWriteUsdPerMtok: 3.75,
  outputUsdPerMtok: 10.0,
  outputReasoningUsdPerMtok: 12.0,
  effectiveFrom: new Date('2025-01-01T00:00:00Z'),
}

const calc = new CostCalculator()

describe('CostCalculator', () => {
  it('returns costUsd = 0 for all-zero usage', () => {
    const { costUsd, breakdown } = calc.compute({ usage: EMPTY_USAGE, pricing: basePricing })
    expect(costUsd).toBe(0)
    expect(breakdown.inputUncached).toBe(0)
    expect(breakdown.inputCachedRead).toBe(0)
    expect(breakdown.inputCachedWrite).toBe(0)
    expect(breakdown.output).toBe(0)
    expect(breakdown.outputReasoning).toBe(0)
  })

  it('computes only inputUncached correctly', () => {
    // 1_000_000 tokens × $2.5/Mtok = $2.5
    const { costUsd, breakdown } = calc.compute({
      usage: { ...EMPTY_USAGE, inputUncached: 1_000_000 },
      pricing: basePricing,
    })
    expect(costUsd).toBeCloseTo(2.5, 6)
    expect(breakdown.inputUncached).toBeCloseTo(2.5, 6)
    expect(breakdown.inputCachedRead).toBe(0)
    expect(breakdown.output).toBe(0)
  })

  it('sums all fields correctly with hand-calculated value', () => {
    // inputUncached:    500_000 × 2.5  / 1M = 1.25
    // inputCachedRead:  200_000 × 1.25 / 1M = 0.25
    // inputCachedWrite: 100_000 × 3.75 / 1M = 0.375
    // output:           300_000 × 10.0 / 1M = 3.0
    // outputReasoning:   50_000 × 12.0 / 1M = 0.6
    // total = 5.475
    const { costUsd, breakdown } = calc.compute({
      usage: {
        inputUncached: 500_000,
        inputCachedRead: 200_000,
        inputCachedWrite: 100_000,
        output: 300_000,
        outputReasoning: 50_000,
      },
      pricing: basePricing,
    })
    expect(costUsd).toBeCloseTo(5.475, 6)
    expect(breakdown.inputUncached).toBeCloseTo(1.25, 6)
    expect(breakdown.inputCachedRead).toBeCloseTo(0.25, 6)
    expect(breakdown.inputCachedWrite).toBeCloseTo(0.375, 6)
    expect(breakdown.output).toBeCloseTo(3.0, 6)
    expect(breakdown.outputReasoning).toBeCloseTo(0.6, 6)
  })

  it('breakdown fields sum to costUsd', () => {
    const { costUsd, breakdown } = calc.compute({
      usage: {
        inputUncached: 123_456,
        inputCachedRead: 78_901,
        inputCachedWrite: 23_456,
        output: 456_789,
        outputReasoning: 12_345,
      },
      pricing: basePricing,
    })
    const sum =
      breakdown.inputUncached +
      breakdown.inputCachedRead +
      breakdown.inputCachedWrite +
      breakdown.output +
      breakdown.outputReasoning
    expect(Math.abs(sum - costUsd)).toBeLessThan(1e-6)
  })

  it('produces exactly 0 for each zero-token component', () => {
    const pricing: Pricing = { ...basePricing }
    const { breakdown } = calc.compute({ usage: EMPTY_USAGE, pricing })
    for (const v of Object.values(breakdown)) {
      expect(v).toBe(0)
      expect(Number.isNaN(v)).toBe(false)
    }
  })

  it('does not produce negative costs even with zero rates', () => {
    const zeroPricing: Pricing = {
      ...basePricing,
      inputUsdPerMtok: 0,
      inputCachedReadUsdPerMtok: 0,
      inputCachedWriteUsdPerMtok: 0,
      outputUsdPerMtok: 0,
      outputReasoningUsdPerMtok: 0,
    }
    const { costUsd, breakdown } = calc.compute({
      usage: {
        inputUncached: 1000,
        inputCachedRead: 1000,
        inputCachedWrite: 1000,
        output: 1000,
        outputReasoning: 1000,
      },
      pricing: zeroPricing,
    })
    expect(costUsd).toBeGreaterThanOrEqual(0)
    for (const v of Object.values(breakdown)) {
      expect(v).toBeGreaterThanOrEqual(0)
    }
  })

  it('rounds costUsd to 6 decimal places', () => {
    // 1 token × $2.5/Mtok = $0.0000025 — rounds to 6dp → 0.000003
    const { costUsd } = calc.compute({
      usage: { ...EMPTY_USAGE, inputUncached: 1 },
      pricing: basePricing,
    })
    // Math.round(0.0000025 * 1_000_000) / 1_000_000 = Math.round(2.5) / 1_000_000
    // = 3 / 1_000_000 = 0.000003
    expect(costUsd).toBe(0.000003)
    // Verify no more than 6 decimal places
    const decimalStr = costUsd.toFixed(6)
    expect(Number(decimalStr)).toBe(costUsd)
  })
})
