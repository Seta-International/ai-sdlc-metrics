import { Injectable } from '@nestjs/common'
import type { ModelTier, ElevatedNoticeLevel } from '../../domain/scorer-types'
import { QualityCanaryScheduler } from './quality-canary-scheduler'

export type FallbackDecision = 'full' | 'nano' | 'both_degraded'

export const DEGRADED_TIER_FALLBACK = Symbol('DEGRADED_TIER_FALLBACK')

@Injectable()
export class DegradedTierFallback {
  constructor(private readonly canaryScheduler: QualityCanaryScheduler) {}

  /**
   * Returns which tier to use for the request, or 'both_degraded' if neither tier is healthy.
   * - If the requested tier is healthy → return it.
   * - If the requested tier is degraded but the other tier is healthy → return the other tier.
   * - If both tiers are degraded → return 'both_degraded'.
   *
   * Synchronous: reads cached degraded flags (no DB I/O).
   */
  shouldFallback(currentTier: ModelTier): FallbackDecision {
    const fullDegraded = this.canaryScheduler.degradedFlag('full')
    const nanoDegraded = this.canaryScheduler.degradedFlag('nano')

    if (currentTier === 'full') {
      if (!fullDegraded) return 'full'
      if (!nanoDegraded) return 'nano'
      return 'both_degraded'
    }

    // currentTier === 'nano'
    if (!nanoDegraded) return 'nano'
    if (!fullDegraded) return 'full'
    return 'both_degraded'
  }

  /**
   * Returns the current elevated notice level based on both-tiers health.
   * - 'none': at least one tier is healthy — normal operation.
   * - 'elevated': both degraded, but lowest success rate ≥ 50% — continue with warning.
   * - 'hard_refusal': both degraded and lowest success rate < 50% — refuse all requests.
   *
   * Synchronous: reads cached health snapshots (no DB I/O).
   * Returns 'none' if cache is not yet populated (safe default at startup).
   */
  getElevatedNoticeLevel(): ElevatedNoticeLevel {
    const fullDegraded = this.canaryScheduler.degradedFlag('full')
    const nanoDegraded = this.canaryScheduler.degradedFlag('nano')

    if (!fullDegraded || !nanoDegraded) {
      return 'none'
    }

    // Both tiers are degraded — check cached success rates
    const fullHealth = this.canaryScheduler.getCachedHealth('full')
    const nanoHealth = this.canaryScheduler.getCachedHealth('nano')

    // If either cache is absent, default to 'elevated' (degraded but not hard-refusing without data)
    if (!fullHealth || !nanoHealth) {
      return 'elevated'
    }

    const HARD_REFUSAL_THRESHOLD = 0.5
    const minRate = Math.min(fullHealth.successRateRolling, nanoHealth.successRateRolling)

    return minRate < HARD_REFUSAL_THRESHOLD ? 'hard_refusal' : 'elevated'
  }
}
