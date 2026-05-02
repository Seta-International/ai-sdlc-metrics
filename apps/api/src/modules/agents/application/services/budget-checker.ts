import { Inject, Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { agentTenantBudget, agentUserBudget } from '../../infrastructure/schema/agents.schema'
import {
  setBudgetRemaining,
  setBudgetUserRemaining,
  recordTierShift,
} from '../../infrastructure/observability/cost-metrics'

export interface PreTurnCheckResult {
  allowed: boolean
  tier: 'full' | 'nano' | 'refused'
  reason?: string
  tierShift?: boolean
}

export interface MidTurnCheckResult {
  allowed: boolean
  tier: 'full' | 'nano'
  shouldAbort: boolean
}

@Injectable()
export class BudgetChecker {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  /**
   * Pre-turn budget check.
   *
   * Returns tier and allow/refuse decision before starting a turn.
   * All DB queries are awaited sequentially (single pg.PoolClient per request).
   */
  async preTurnCheck(opts: { tenantId: string; userId: string }): Promise<PreTurnCheckResult> {
    const [tenantBudget] = await this.db
      .select()
      .from(agentTenantBudget)
      .where(eq(agentTenantBudget.tenantId, opts.tenantId))

    if (!tenantBudget) {
      // No budget configured = no limit
      return { allowed: true, tier: 'full' }
    }

    const dailyLimit = Number(tenantBudget.dailyLimitUsd)
    const remaining = Number(tenantBudget.remainingUsd)
    const usedPct = dailyLimit > 0 ? 1 - remaining / dailyLimit : 1

    const todayMidnightUtc = new Date()
    todayMidnightUtc.setUTCHours(0, 0, 0, 0)
    const todayUtc = todayMidnightUtc.toISOString().slice(0, 10) // YYYY-MM-DD

    const [userBudget] = await this.db
      .select()
      .from(agentUserBudget)
      .where(
        and(
          eq(agentUserBudget.tenantId, opts.tenantId),
          eq(agentUserBudget.userId, opts.userId),
          eq(agentUserBudget.date, todayUtc),
        ),
      )

    if (userBudget && Number(userBudget.remainingUsd) <= 0) {
      return { allowed: false, tier: 'refused', reason: 'user_daily_budget' }
    }

    // When no user budget row is present, the user has no per-user cap — snapshot
    // the tenant remaining as a proxy (bounded by the tenant ceiling).
    const userRemainingUsd = userBudget !== undefined ? Number(userBudget.remainingUsd) : remaining

    if (remaining <= 0) {
      setBudgetRemaining(opts.tenantId, 0)
      setBudgetUserRemaining(opts.tenantId, 0)
      return { allowed: false, tier: 'refused', reason: 'tenant_daily_budget' }
    }

    // 95–100% range → downgrade to nano (must run before insufficient_minimum)
    if (usedPct >= 0.95) {
      setBudgetRemaining(opts.tenantId, remaining)
      setBudgetUserRemaining(opts.tenantId, userRemainingUsd)
      recordTierShift(opts.tenantId, 'full', 'nano', 'budget')
      return { allowed: true, tier: 'nano', tierShift: true }
    }

    // Insufficient minimum ($0.10)
    if (remaining < 0.1) {
      setBudgetRemaining(opts.tenantId, remaining)
      setBudgetUserRemaining(opts.tenantId, userRemainingUsd)
      return { allowed: false, tier: 'refused', reason: 'insufficient_minimum' }
    }

    setBudgetRemaining(opts.tenantId, remaining)
    setBudgetUserRemaining(opts.tenantId, userRemainingUsd)
    return { allowed: true, tier: 'full', tierShift: false }
  }

  /**
   * Mid-turn budget check.
   *
   * Called during an ongoing turn to decide whether to abort based on
   * consumed cost so far.
   */
  async midTurnCheck(opts: {
    tenantId: string
    userId: string
    consumedUsd: number
  }): Promise<MidTurnCheckResult> {
    const [tenantBudget] = await this.db
      .select()
      .from(agentTenantBudget)
      .where(eq(agentTenantBudget.tenantId, opts.tenantId))

    if (!tenantBudget) {
      return { allowed: true, tier: 'full', shouldAbort: false }
    }

    const dailyLimit = Number(tenantBudget.dailyLimitUsd)
    const remaining = Number(tenantBudget.remainingUsd)
    const newRemaining = remaining - opts.consumedUsd

    if (newRemaining <= 0) {
      return { allowed: false, tier: 'full', shouldAbort: true }
    }

    if (dailyLimit > 0 && newRemaining / dailyLimit < 0.05) {
      return { allowed: true, tier: 'nano', shouldAbort: false }
    }

    return { allowed: true, tier: 'full', shouldAbort: false }
  }
}
