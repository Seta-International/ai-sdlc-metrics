import { Injectable, Inject, Logger } from '@nestjs/common'
import { randomUUID } from 'crypto'
import {
  CANARY_RUN_REPOSITORY,
  type CanaryRunRepository,
} from '../../domain/repositories/canary-run.repository'
import {
  CANARY_QUERY_REPOSITORY,
  type CanaryQueryRepository,
} from '../../domain/repositories/canary-query.repository'
import type { ModelTier, ElevatedNoticeLevel } from '../../domain/scorer-types'
import type { CanaryStateChange } from '../../domain/cost/cost-types'
import { QualityCanarySubscription } from './quality-canary-subscription'

export const QUALITY_CANARY_SCHEDULER = Symbol('QUALITY_CANARY_SCHEDULER')

export type TierHealthSnapshot = {
  tier: ModelTier
  successRateRolling: number
  degradedFlag: boolean
  degradedSince?: Date
  elevatedNoticeLevel: ElevatedNoticeLevel
}

const TIERS: ModelTier[] = ['full', 'nano']

// Synthetic fixture tenant used for canary runs (MVP stub)
const CANARY_FIXTURE_TENANT_ID = '00000000-0000-0000-0000-000000000001'

@Injectable()
export class QualityCanaryScheduler {
  private readonly logger = new Logger(QualityCanaryScheduler.name)

  // Configurable thresholds (defaults from plan spec)
  private readonly DEGRADED_THRESHOLD = 0.9 // <90% rolling success → degraded
  private readonly WINDOW_MS = 30 * 60 * 1000 // 30-minute sliding window
  private readonly HARD_REFUSAL_THRESHOLD = 0.5 // <50% both-tiers → hard refusal

  // In-memory degraded-flag cache per tier
  private readonly degradedFlags = new Map<ModelTier, boolean>()

  // In-memory degraded-since timestamps per tier
  private readonly degradedSince = new Map<ModelTier, Date>()

  // Round-robin last-used query ID per tier
  private readonly lastQueryId = new Map<ModelTier, string>()

  constructor(
    @Inject(CANARY_RUN_REPOSITORY) private readonly canaryRunRepo: CanaryRunRepository,
    @Inject(CANARY_QUERY_REPOSITORY) private readonly canaryQueryRepo: CanaryQueryRepository,
    private readonly canarySubscription: QualityCanarySubscription,
  ) {}

  // Called by pg-boss hourly job
  async tickHourly(): Promise<void> {
    for (const tier of TIERS) {
      await this._tickTier(tier)
    }
  }

  private async _tickTier(tier: ModelTier): Promise<void> {
    const afterId = this.lastQueryId.get(tier)
    const canaryQuery = await this.canaryQueryRepo.findNextRoundRobin(tier, afterId)

    if (!canaryQuery) {
      this.logger.log(`No active canary queries for tier=${tier}; skipping tick`)
      return
    }

    this.lastQueryId.set(tier, canaryQuery.id)

    // MVP stub: record a synthetic 100ms run with score 1.0 / passed outcome
    await this.canaryRunRepo.insert({
      runAt: new Date(),
      tier,
      canaryQueryId: canaryQuery.id,
      tenantId: CANARY_FIXTURE_TENANT_ID,
      traceId: randomUUID(),
      outcome: 'passed',
      score: 1.0,
      durationMs: 100,
    })

    const previousFlag = this.degradedFlags.get(tier) ?? false
    const snapshot = await this.computeHealth(tier)
    const currentFlag = snapshot.degradedFlag

    // Publish if flag flipped
    if (previousFlag !== currentFlag) {
      this.degradedFlags.set(tier, currentFlag)
      this._publishStateChange(snapshot)
    }
  }

  private _publishStateChange(changed: TierHealthSnapshot): void {
    const fullHealth = this._getCachedHealth('full')
    const nanoHealth = this._getCachedHealth('nano')

    const primaryHealthy = !fullHealth.degradedFlag
    const fallbackHealthy = !nanoHealth.degradedFlag

    const successRatePrimary = Math.round(fullHealth.successRateRolling * 100)
    const successRateFallback = Math.round(nanoHealth.successRateRolling * 100)

    let severity: CanaryStateChange['severity'] = 'nominal'
    if (!primaryHealthy && !fallbackHealthy) {
      const minRate = Math.min(fullHealth.successRateRolling, nanoHealth.successRateRolling)
      severity = minRate < this.HARD_REFUSAL_THRESHOLD ? 'collapse' : 'both_degraded'
    } else if (!primaryHealthy) {
      severity = 'primary_degraded'
    }

    const event: CanaryStateChange = {
      windowId: randomUUID(),
      observedAt: new Date(),
      primaryTierHealthy: primaryHealthy,
      fallbackTierHealthy: fallbackHealthy,
      successRatePct: { primary: successRatePrimary, fallback: successRateFallback },
      severity,
    }

    this.canarySubscription.publish(event)
  }

  private _getCachedHealth(tier: ModelTier): TierHealthSnapshot {
    const degradedFlag = this.degradedFlags.get(tier) ?? false
    const degradedSince = this.degradedSince.get(tier)
    return {
      tier,
      successRateRolling: degradedFlag ? 0 : 1,
      degradedFlag,
      degradedSince,
      elevatedNoticeLevel: 'none',
    }
  }

  // Compute rolling success rate for a tier over the last WINDOW_MS
  async computeHealth(tier: ModelTier): Promise<TierHealthSnapshot> {
    const runs = await this.canaryRunRepo.findRecent({ tier, sinceMs: this.WINDOW_MS })

    if (runs.length === 0) {
      return {
        tier,
        successRateRolling: 1.0,
        degradedFlag: false,
        elevatedNoticeLevel: 'none',
      }
    }

    const passedCount = runs.filter((r) => r.outcome === 'passed').length
    const successRateRolling = passedCount / runs.length
    const degradedFlag = successRateRolling < this.DEGRADED_THRESHOLD

    // Track degradedSince in-memory
    if (degradedFlag && !this.degradedSince.has(tier)) {
      this.degradedSince.set(tier, new Date())
    } else if (!degradedFlag) {
      this.degradedSince.delete(tier)
    }

    const degradedSince = this.degradedSince.get(tier)

    // Compute elevatedNoticeLevel
    // Check if both tiers are degraded for the notice level calculation
    const otherTier: ModelTier = tier === 'full' ? 'nano' : 'full'
    const otherDegraded = this.degradedFlags.get(otherTier) ?? false

    let elevatedNoticeLevel: ElevatedNoticeLevel = 'none'
    if (degradedFlag && otherDegraded) {
      const otherRate = await this._getOtherTierRate(otherTier)
      const minRate = Math.min(successRateRolling, otherRate)
      elevatedNoticeLevel = minRate < this.HARD_REFUSAL_THRESHOLD ? 'hard_refusal' : 'elevated'
    }

    // Update in-memory degraded flag cache
    this.degradedFlags.set(tier, degradedFlag)

    return {
      tier,
      successRateRolling,
      degradedFlag,
      ...(degradedSince ? { degradedSince } : {}),
      elevatedNoticeLevel,
    }
  }

  private async _getOtherTierRate(tier: ModelTier): Promise<number> {
    const runs = await this.canaryRunRepo.findRecent({ tier, sinceMs: this.WINDOW_MS })
    if (runs.length === 0) return 1.0
    const passedCount = runs.filter((r) => r.outcome === 'passed').length
    return passedCount / runs.length
  }

  // Read cached degraded flag (in-memory, set by tickHourly)
  degradedFlag(tier: ModelTier): boolean {
    return this.degradedFlags.get(tier) ?? false
  }
}
