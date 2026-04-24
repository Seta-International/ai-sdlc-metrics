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
  /** true if thumbsDown(high) >= thumbsDown(low) — unexpected ordering inversion (R-10.25/R-10.26) */
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
   * Expected ordering (R-10.25): thumbsDown(high) < thumbsDown(med) < thumbsDown(low).
   * Inversion triggers §9 confidence-derivation-rule refinement review (R-10.26).
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
   * Returns true if the thumbs-down ordering is inverted (unexpected: high >= low).
   * Only meaningful when both high and low have count > 0.
   */
  static isInverted(stats: Record<ConfidenceTier, TierCalibrationStats>): boolean {
    // Expected: thumbsDown(high) < thumbsDown(low)
    // Inverted: high >= low (unexpected — signals confidence derivation rule issue)
    if (stats.high.count === 0 || stats.low.count === 0) {
      return false
    }
    return stats.high.thumbsDownRate >= stats.low.thumbsDownRate
  }
}
