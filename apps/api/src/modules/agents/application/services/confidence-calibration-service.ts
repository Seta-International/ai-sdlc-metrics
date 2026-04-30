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
   * Correlates synthesizer confidence tier against thumbs-down rate and initiator-approval rate.
   *
   * Expected ordering: thumbsDown(high) < thumbsDown(med) < thumbsDown(low).
   * Inversion triggers §9 confidence-derivation-rule refinement review.
   *
   * MVP stub: thumbs-down and initiator-approval data comes from Plan 08's feedback tables.
   * Wire real queries when Plan 08 feedback data is available.
   */
  async correlate(_opts: CalibrationOpts): Promise<CalibrationResult> {
    const empty: TierCalibrationStats = { thumbsDownRate: 0, initiatorApprovalRate: 0, count: 0 }
    const byTier: Record<ConfidenceTier, TierCalibrationStats> = {
      high: { ...empty },
      med: { ...empty },
      low: { ...empty },
    }

    return {
      byTier,
      invertedOrdering: ConfidenceCalibrationService.isInverted(byTier),
    }
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
