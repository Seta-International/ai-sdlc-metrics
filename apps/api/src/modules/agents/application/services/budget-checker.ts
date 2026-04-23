import { Inject, Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { agentTenantBudget, agentUserBudget } from '../../infrastructure/schema/agents.schema'

// ─── Return types ─────────────────────────────────────────────────────────────

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

// ─── BudgetChecker ────────────────────────────────────────────────────────────

@Injectable()
export class BudgetChecker {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  /**
   * Pre-turn budget check (Plan 05 §4).
   *
   * Returns tier and allow/refuse decision before starting a turn.
   * All DB queries are awaited sequentially (single pg.PoolClient per request).
   */
  async preTurnCheck(opts: { tenantId: string; userId: string }): Promise<PreTurnCheckResult> {
    // Step 1 — query tenant budget
    const [tenantBudget] = await this.db
      .select()
      .from(agentTenantBudget)
      .where(eq(agentTenantBudget.tenantId, opts.tenantId))

    if (!tenantBudget) {
      // No budget configured = no limit
      return { allowed: true, tier: 'full' }
    }

    // Step 2 — compute tenant usage percentage
    const dailyLimit = Number(tenantBudget.dailyLimitUsd)
    const remaining = Number(tenantBudget.remainingUsd)
    const usedPct = dailyLimit > 0 ? 1 - remaining / dailyLimit : 1

    // Step 3 — check user budget (agentUserBudget pre-aggregated by CostRecorder)
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

    // Step 5 — check tenant 100%
    if (remaining <= 0) {
      return { allowed: false, tier: 'refused', reason: 'tenant_daily_budget' }
    }

    // Step 6 — check 95–100% range → downgrade to nano (spec §5: before insufficient_minimum)
    if (usedPct >= 0.95) {
      return { allowed: true, tier: 'nano', tierShift: true }
    }

    // Step 7 — check insufficient minimum ($0.10)
    if (remaining < 0.1) {
      return { allowed: false, tier: 'refused', reason: 'insufficient_minimum' }
    }

    // Step 8 — default: full tier
    return { allowed: true, tier: 'full', tierShift: false }
  }

  /**
   * Mid-turn budget check (Plan 05 §4).
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
