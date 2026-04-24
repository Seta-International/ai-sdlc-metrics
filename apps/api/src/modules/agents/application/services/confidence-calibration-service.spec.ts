/**
 * confidence-calibration-service.spec.ts — Plan 10 Task 8
 *
 * Unit tests for ConfidenceCalibrationService.
 */

import { describe, it, expect } from 'vitest'
import {
  ConfidenceCalibrationService,
  type TierCalibrationStats,
  type ConfidenceTier,
} from './confidence-calibration-service'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeStats(thumbsDownRate: number, count: number): TierCalibrationStats {
  return { thumbsDownRate, initiatorApprovalRate: 0, count }
}

function makeByTier(
  high: TierCalibrationStats,
  med: TierCalibrationStats,
  low: TierCalibrationStats,
): Record<ConfidenceTier, TierCalibrationStats> {
  return { high, med, low }
}

// ─── correlate (MVP stub) tests ────────────────────────────────────────────────

describe('ConfidenceCalibrationService.correlate()', () => {
  const db = {} as never
  const svc = new ConfidenceCalibrationService(db)

  it('1. MVP stub returns zeros for all tiers', async () => {
    const result = await svc.correlate({
      dateRange: { from: new Date('2026-01-01'), to: new Date('2026-04-01') },
    })

    expect(result.byTier.high).toEqual({ thumbsDownRate: 0, initiatorApprovalRate: 0, count: 0 })
    expect(result.byTier.med).toEqual({ thumbsDownRate: 0, initiatorApprovalRate: 0, count: 0 })
    expect(result.byTier.low).toEqual({ thumbsDownRate: 0, initiatorApprovalRate: 0, count: 0 })
  })

  it('2. invertedOrdering: false when all counts are zero', async () => {
    const result = await svc.correlate({
      dateRange: { from: new Date('2026-01-01'), to: new Date('2026-04-01') },
    })

    expect(result.invertedOrdering).toBe(false)
  })
})

// ─── isInverted static method tests ──────────────────────────────────────────

describe('ConfidenceCalibrationService.isInverted()', () => {
  it('3. returns true when high thumbsDown >= low thumbsDown (both have count > 0)', () => {
    // high has worse rate than low — ordering inverted
    const stats = makeByTier(
      makeStats(0.3, 50), // high — unexpectedly high thumbs-down
      makeStats(0.2, 40), // med
      makeStats(0.1, 60), // low — unexpectedly low thumbs-down
    )

    expect(ConfidenceCalibrationService.isInverted(stats)).toBe(true)
  })

  it('4. returns false when ordering is correct (high < low)', () => {
    // Expected ordering: high < low
    const stats = makeByTier(
      makeStats(0.05, 50), // high — low thumbs-down (confident, correct)
      makeStats(0.12, 40), // med
      makeStats(0.25, 60), // low — higher thumbs-down (less confident)
    )

    expect(ConfidenceCalibrationService.isInverted(stats)).toBe(false)
  })

  it('5. returns false when counts are zero (not enough data)', () => {
    // Equal rates but no data — should not report inversion
    const stats = makeByTier(
      makeStats(0.5, 0), // high — zero count
      makeStats(0.2, 10), // med
      makeStats(0.1, 0), // low — zero count
    )

    expect(ConfidenceCalibrationService.isInverted(stats)).toBe(false)
  })
})
