/**
 * degraded-tier-fallback.spec.ts — Plan 10 Task 8
 *
 * Unit tests for DegradedTierFallback.
 */

import { describe, it, expect, vi } from 'vitest'
import { DegradedTierFallback } from './degraded-tier-fallback'
import type { QualityCanaryScheduler, TierHealthSnapshot } from './quality-canary-scheduler'
import type { ModelTier } from '../../domain/scorer-types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSnapshot(
  tier: ModelTier,
  successRateRolling: number,
  degradedFlag: boolean,
): TierHealthSnapshot {
  return {
    tier,
    successRateRolling,
    degradedFlag,
    elevatedNoticeLevel: 'none',
  }
}

function makeScheduler(opts: {
  fullDegraded: boolean
  nanoDegraded: boolean
  fullRate?: number
  nanoRate?: number
}): QualityCanaryScheduler {
  const { fullDegraded, nanoDegraded, fullRate = 1.0, nanoRate = 1.0 } = opts

  const fullSnapshot = makeSnapshot('full', fullRate, fullDegraded)
  const nanoSnapshot = makeSnapshot('nano', nanoRate, nanoDegraded)

  return {
    degradedFlag: vi.fn().mockImplementation((tier: ModelTier) => {
      if (tier === 'full') return fullDegraded
      return nanoDegraded
    }),
    getCachedHealth: vi.fn().mockImplementation((tier: ModelTier) => {
      if (tier === 'full') return fullSnapshot
      return nanoSnapshot
    }),
  } as unknown as QualityCanaryScheduler
}

// ─── shouldFallback tests ─────────────────────────────────────────────────────

describe('DegradedTierFallback.shouldFallback()', () => {
  it('1. full requested, neither degraded → returns full', () => {
    const svc = new DegradedTierFallback(
      makeScheduler({ fullDegraded: false, nanoDegraded: false }),
    )
    expect(svc.shouldFallback('full')).toBe('full')
  })

  it('2. full requested, full degraded, nano ok → returns nano', () => {
    const svc = new DegradedTierFallback(makeScheduler({ fullDegraded: true, nanoDegraded: false }))
    expect(svc.shouldFallback('full')).toBe('nano')
  })

  it('3. nano requested, nano degraded, full ok → returns full', () => {
    const svc = new DegradedTierFallback(makeScheduler({ fullDegraded: false, nanoDegraded: true }))
    expect(svc.shouldFallback('nano')).toBe('full')
  })

  it('4. full requested, both degraded → returns both_degraded', () => {
    const svc = new DegradedTierFallback(makeScheduler({ fullDegraded: true, nanoDegraded: true }))
    expect(svc.shouldFallback('full')).toBe('both_degraded')
  })

  it('5. nano requested, both degraded → returns both_degraded', () => {
    const svc = new DegradedTierFallback(makeScheduler({ fullDegraded: true, nanoDegraded: true }))
    expect(svc.shouldFallback('nano')).toBe('both_degraded')
  })

  it('6. nano requested, neither degraded → returns nano', () => {
    const svc = new DegradedTierFallback(
      makeScheduler({ fullDegraded: false, nanoDegraded: false }),
    )
    expect(svc.shouldFallback('nano')).toBe('nano')
  })

  it('7. nano requested, only full is degraded (nano ok) → returns nano (no fallback needed)', () => {
    const svc = new DegradedTierFallback(makeScheduler({ fullDegraded: true, nanoDegraded: false }))
    expect(svc.shouldFallback('nano')).toBe('nano')
  })

  it('8. full requested, only nano is degraded (full ok) → returns full (no fallback needed)', () => {
    const svc = new DegradedTierFallback(makeScheduler({ fullDegraded: false, nanoDegraded: true }))
    expect(svc.shouldFallback('full')).toBe('full')
  })
})

// ─── getElevatedNoticeLevel tests ─────────────────────────────────────────────

describe('DegradedTierFallback.getElevatedNoticeLevel()', () => {
  it('6. neither degraded → returns none', () => {
    const svc = new DegradedTierFallback(
      makeScheduler({ fullDegraded: false, nanoDegraded: false }),
    )
    expect(svc.getElevatedNoticeLevel()).toBe('none')
  })

  it('7. both degraded with success rate >= 50% → returns elevated', () => {
    const svc = new DegradedTierFallback(
      makeScheduler({ fullDegraded: true, nanoDegraded: true, fullRate: 0.6, nanoRate: 0.7 }),
    )
    expect(svc.getElevatedNoticeLevel()).toBe('elevated')
  })

  it('8. both degraded with success rate < 50% → returns hard_refusal', () => {
    const svc = new DegradedTierFallback(
      makeScheduler({ fullDegraded: true, nanoDegraded: true, fullRate: 0.3, nanoRate: 0.4 }),
    )
    expect(svc.getElevatedNoticeLevel()).toBe('hard_refusal')
  })
})
