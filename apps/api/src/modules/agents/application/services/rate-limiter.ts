import { Inject, Injectable, Logger } from '@nestjs/common'
import { and, eq, sql } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { agentRateLimitCounter } from '../../infrastructure/schema/agents.schema'
import { recordRateLimitRejected } from '../../infrastructure/observability/cost-metrics'

// ─── Types ────────────────────────────────────────────────────────────────────

export type RateLimitKey = 'queries/user/min' | 'l3_writes/user/day' | 'schedule_creations/user/day'

export interface RateLimitCheckResult {
  allowed: boolean
  remaining?: number
  resetAt?: Date
}

// ─── Limits per key ───────────────────────────────────────────────────────────

const LIMITS: Record<RateLimitKey, number> = {
  'queries/user/min': 30,
  'l3_writes/user/day': 20,
  'schedule_creations/user/day': 5,
}

// ─── RateLimiter ──────────────────────────────────────────────────────────────

@Injectable()
export class RateLimiter {
  private readonly logger = new Logger(RateLimiter.name)

  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  /**
   * Check and increment the rate limit counter for a given key.
   *
   * Uses a Postgres-backed counter (no Redis dependency at MVP).
   * Fails soft on DB errors: returns `{ allowed: true }` for availability
   * over enforcement (R-05.26).
   */
  async check(opts: {
    tenantId: string
    userId: string
    limitKey: RateLimitKey
  }): Promise<RateLimitCheckResult> {
    const { bucket, resetAt } = this.computeBucket(opts.limitKey)
    const limit = LIMITS[opts.limitKey]

    try {
      // Upsert: insert count=1 on first call; increment on conflict
      await this.db
        .insert(agentRateLimitCounter)
        .values({
          tenantId: opts.tenantId,
          userId: opts.userId,
          limitKey: opts.limitKey,
          bucket,
          count: 1,
          updatedAt: sql`NOW()`,
        })
        .onConflictDoUpdate({
          target: [
            agentRateLimitCounter.tenantId,
            agentRateLimitCounter.userId,
            agentRateLimitCounter.limitKey,
            agentRateLimitCounter.bucket,
          ],
          set: {
            count: sql`${agentRateLimitCounter.count} + 1`,
            updatedAt: sql`NOW()`,
          },
        })

      // Read back current count
      const [row] = await this.db
        .select()
        .from(agentRateLimitCounter)
        .where(
          and(
            eq(agentRateLimitCounter.tenantId, opts.tenantId),
            eq(agentRateLimitCounter.userId, opts.userId),
            eq(agentRateLimitCounter.limitKey, opts.limitKey),
            eq(agentRateLimitCounter.bucket, bucket),
          ),
        )

      const count = row?.count ?? 1

      if (count > limit) {
        // Emit rate-limit rejection metric (Plan 05 §8). No user_id label (R-05.30).
        recordRateLimitRejected(opts.tenantId, opts.limitKey)
        return { allowed: false, remaining: 0, resetAt }
      }

      return { allowed: true, remaining: limit - count, resetAt }
    } catch (err) {
      // R-05.26: availability over enforcement for transient DB failures
      this.logger.warn(
        `RateLimiter DB failure for key=${opts.limitKey} tenant=${opts.tenantId}: ${err}`,
      )
      return { allowed: true }
    }
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private computeBucket(limitKey: RateLimitKey): { bucket: Date; resetAt: Date } {
    const now = new Date()

    if (limitKey === 'queries/user/min') {
      // Truncate to minute start (zero out seconds + ms)
      const bucket = new Date(now)
      bucket.setUTCSeconds(0, 0)

      const resetAt = new Date(bucket.getTime() + 60_000)
      return { bucket, resetAt }
    }

    // Day-based keys: truncate to UTC midnight
    const bucket = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    const resetAt = new Date(bucket.getTime() + 86_400_000)
    return { bucket, resetAt }
  }
}
