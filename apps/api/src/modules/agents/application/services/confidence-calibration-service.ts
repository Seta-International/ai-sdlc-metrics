import { Injectable, Inject } from '@nestjs/common'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'

export type ConfidenceTier = 'high' | 'med' | 'low'

export type TierCalibrationStats = {
  thumbsDownRate: number
  initiatorApprovalRate: number
  count: number
}

export type CalibrationResult = {
  byTier: Record<ConfidenceTier, TierCalibrationStats>
  /** true if any inversion detected in chain high < med < low */
  invertedOrdering: boolean
}

export type CalibrationOpts = {
  tenantId?: string
  dateRange: { from: Date; to: Date }
}

export const CONFIDENCE_CALIBRATION_SERVICE = Symbol('CONFIDENCE_CALIBRATION_SERVICE')

@Injectable()
export class ConfidenceCalibrationService {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  /**
   * Returns true once Plan 08 feedback tables (thumbs-down, initiator-approval)
   * are wired and `correlate()` is safe to invoke. Currently false — callers
   * MUST gate on this before calling `correlate()`.
   */
  isEnabled(): boolean {
    return false
  }

  /**
   * Correlates synthesizer confidence tier against thumbs-down rate and
   * initiator-approval rate. Expected ordering:
   *   thumbsDown(high) < thumbsDown(med) < thumbsDown(low)
   * Inversion triggers §9 confidence-derivation-rule refinement review.
   *
   * Throws until Plan 08 feedback tables are populated. Returning all-zero
   * data silently would corrupt the calibration audit by suggesting the
   * ordering check ran against real data.
   */
  async correlate(_opts: CalibrationOpts): Promise<CalibrationResult> {
    throw new Error(
      'ConfidenceCalibrationService is disabled — Plan 08 feedback tables not yet wired. ' +
        'Gate calls with isEnabled() before invoking correlate().',
    )
  }

  /**
   * Returns true if ANY inversion is detected in the expected chain high < med < low.
   * Only meaningful when all three tiers have count > 0.
   */
  static isInverted(stats: Record<ConfidenceTier, TierCalibrationStats>): boolean {
    // Expected ordering: thumbsDown(high) < thumbsDown(med) < thumbsDown(low)
    // Only check when sufficient data present (count > 0)
    const { high, med, low } = stats
    if (high.count === 0 || med.count === 0 || low.count === 0) return false
    return high.thumbsDownRate >= med.thumbsDownRate || med.thumbsDownRate >= low.thumbsDownRate
  }
}
