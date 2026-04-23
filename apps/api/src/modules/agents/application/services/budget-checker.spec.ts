/**
 * budget-checker.spec.ts — Plan 05 §4 — BudgetChecker service
 *
 * Covers:
 *  1. preTurnCheck: no budget row → allowed, tier=full
 *  2. preTurnCheck: user at 100% daily → refused, reason=user_daily_budget
 *  3. preTurnCheck: tenant at 100% → refused, reason=tenant_daily_budget
 *  4. preTurnCheck: remaining < $0.10, but usedPct < 0.95 → refused, reason=insufficient_minimum
 *  5. preTurnCheck: tenant at 96% used → allowed, tier=nano, tierShift=true
 *  6. preTurnCheck: tenant at 50% → allowed, tier=full, tierShift=false
 *  7. preTurnCheck: tenant at 85% (80-95%) → allowed, tier=full (boundary test)
 *  8. preTurnCheck: low-limit tenant at 97% with <$0.10 remaining → nano (nano before insufficient_minimum)
 *  9. midTurnCheck: no budget row → allowed, tier=full, shouldAbort=false
 * 10. midTurnCheck: consumption pushes remaining to 0 → shouldAbort=true
 * 11. midTurnCheck: consumption pushes remaining to last 4% → tier=nano, shouldAbort=false
 */

import { describe, it, expect, vi } from 'vitest'
import { BudgetChecker } from './budget-checker'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const USER_ID = '01900000-0000-7000-8000-000000000002'

// ─── Mock factories ───────────────────────────────────────────────────────────

/**
 * Builds a DB mock for preTurnCheck with 3 sequential select() calls:
 *   1st → tenantBudgetRows
 *   2nd → userSpentRows
 *   3rd → userBudgetRows
 */
function buildPreTurnDb(
  tenantBudgetRows: Record<string, unknown>[],
  userBudgetRows: Record<string, unknown>[],
) {
  const results = [tenantBudgetRows, userBudgetRows]
  let callIdx = 0

  const whereMock = vi.fn().mockImplementation(() => Promise.resolve(results[callIdx++]))
  const fromMock = vi.fn().mockReturnValue({ where: whereMock })
  const selectMock = vi.fn().mockReturnValue({ from: fromMock })

  return { db: { select: selectMock } as never, whereMock, selectMock }
}

/**
 * Builds a DB mock for midTurnCheck with 1 sequential select() call:
 *   1st → tenantBudgetRows
 */
function buildMidTurnDb(tenantBudgetRows: Record<string, unknown>[]) {
  const whereMock = vi.fn().mockResolvedValue(tenantBudgetRows)
  const fromMock = vi.fn().mockReturnValue({ where: whereMock })
  const selectMock = vi.fn().mockReturnValue({ from: fromMock })

  return { db: { select: selectMock } as never }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BudgetChecker', () => {
  // ── preTurnCheck ─────────────────────────────────────────────────────────────

  describe('preTurnCheck()', () => {
    it('1. returns allowed=true, tier=full when no tenant budget row exists', async () => {
      const { db } = buildPreTurnDb([], [])
      const checker = new BudgetChecker(db)

      const result = await checker.preTurnCheck({ tenantId: TENANT_ID, userId: USER_ID })

      expect(result).toEqual({ allowed: true, tier: 'full' })
    })

    it('2. returns refused, reason=user_daily_budget when user remaining_usd <= 0', async () => {
      const { db } = buildPreTurnDb(
        [{ dailyLimitUsd: '100', remainingUsd: '50' }],
        [{ remainingUsd: '0', dailyLimitUsd: '50' }],
      )
      const checker = new BudgetChecker(db)

      const result = await checker.preTurnCheck({ tenantId: TENANT_ID, userId: USER_ID })

      expect(result).toEqual({ allowed: false, tier: 'refused', reason: 'user_daily_budget' })
    })

    it('3. returns refused, reason=tenant_daily_budget when tenant remaining_usd <= 0', async () => {
      const { db } = buildPreTurnDb(
        [{ dailyLimitUsd: '100', remainingUsd: '0' }],
        [], // no user budget row
      )
      const checker = new BudgetChecker(db)

      const result = await checker.preTurnCheck({ tenantId: TENANT_ID, userId: USER_ID })

      expect(result).toEqual({ allowed: false, tier: 'refused', reason: 'tenant_daily_budget' })
    })

    it('4. returns refused, reason=insufficient_minimum when remaining < $0.10, usedPct < 0.95', async () => {
      // dailyLimit=$10, remaining=$0.05 → usedPct=99.5% → nano fires before insufficient_minimum
      // Use a case where usedPct < 0.95 but remaining < $0.10: dailyLimit=$1, remaining=$0.05 → usedPct=95% — still nano
      // Correct fixture: dailyLimit=$1000, remaining=$0.05 → usedPct~100% → tenant_daily_budget fires first (remaining<=0 check)
      // Actually: for insufficient_minimum to fire, need usedPct < 0.95 AND remaining < $0.10
      // → dailyLimit=$1000, remaining=$0.05: usedPct=99.995% — nano fires. That's correct per spec.
      // → dailyLimit=$0.20, remaining=$0.05: usedPct=75%, remaining=0.05 < 0.10 → insufficient_minimum fires
      const { db } = buildPreTurnDb([{ dailyLimitUsd: '0.20', remainingUsd: '0.05' }], [])
      const checker = new BudgetChecker(db)

      const result = await checker.preTurnCheck({ tenantId: TENANT_ID, userId: USER_ID })

      expect(result).toEqual({ allowed: false, tier: 'refused', reason: 'insufficient_minimum' })
    })

    it('5. returns allowed=true, tier=nano, tierShift=true when tenant at 96% used', async () => {
      // 96% used means remaining = 4, daily = 100
      const { db } = buildPreTurnDb([{ dailyLimitUsd: '100', remainingUsd: '4' }], [])
      const checker = new BudgetChecker(db)

      const result = await checker.preTurnCheck({ tenantId: TENANT_ID, userId: USER_ID })

      expect(result).toEqual({ allowed: true, tier: 'nano', tierShift: true })
    })

    it('6. returns allowed=true, tier=full, tierShift=false when tenant at 50% used', async () => {
      const { db } = buildPreTurnDb([{ dailyLimitUsd: '100', remainingUsd: '50' }], [])
      const checker = new BudgetChecker(db)

      const result = await checker.preTurnCheck({ tenantId: TENANT_ID, userId: USER_ID })

      expect(result).toEqual({ allowed: true, tier: 'full', tierShift: false })
    })

    it('7. returns allowed=true, tier=full at 85% used (80-95% boundary — no nano)', async () => {
      // dailyLimit=$100, remaining=$15 → usedPct=85%
      const { db } = buildPreTurnDb([{ dailyLimitUsd: '100', remainingUsd: '15' }], [])
      const checker = new BudgetChecker(db)

      const result = await checker.preTurnCheck({ tenantId: TENANT_ID, userId: USER_ID })

      expect(result).toEqual({ allowed: true, tier: 'full', tierShift: false })
    })

    it('8. nano fires before insufficient_minimum when usedPct>=0.95 AND remaining<$0.10', async () => {
      // dailyLimit=$1, remaining=$0.04 → usedPct=96% → nano, NOT insufficient_minimum
      const { db } = buildPreTurnDb([{ dailyLimitUsd: '1', remainingUsd: '0.04' }], [])
      const checker = new BudgetChecker(db)

      const result = await checker.preTurnCheck({ tenantId: TENANT_ID, userId: USER_ID })

      expect(result).toEqual({ allowed: true, tier: 'nano', tierShift: true })
    })
  })

  // ── midTurnCheck ─────────────────────────────────────────────────────────────

  describe('midTurnCheck()', () => {
    it('7. returns allowed=true, tier=full, shouldAbort=false when no tenant budget row', async () => {
      const { db } = buildMidTurnDb([])
      const checker = new BudgetChecker(db)

      const result = await checker.midTurnCheck({
        tenantId: TENANT_ID,
        userId: USER_ID,
        consumedUsd: 1,
      })

      expect(result).toEqual({ allowed: true, tier: 'full', shouldAbort: false })
    })

    it('8. returns shouldAbort=true when consumption pushes remaining to 0', async () => {
      const { db } = buildMidTurnDb([{ dailyLimitUsd: '100', remainingUsd: '5' }])
      const checker = new BudgetChecker(db)

      const result = await checker.midTurnCheck({
        tenantId: TENANT_ID,
        userId: USER_ID,
        consumedUsd: 5, // newRemaining = 5 - 5 = 0
      })

      expect(result).toEqual({ allowed: false, tier: 'full', shouldAbort: true })
    })

    it('9. returns tier=nano, shouldAbort=false when consumption pushes remaining into last 4%', async () => {
      // remaining=6, consumed=2 → newRemaining=4 → 4/100 = 0.04 < 0.05 → nano
      const { db } = buildMidTurnDb([{ dailyLimitUsd: '100', remainingUsd: '6' }])
      const checker = new BudgetChecker(db)

      const result = await checker.midTurnCheck({
        tenantId: TENANT_ID,
        userId: USER_ID,
        consumedUsd: 2,
      })

      expect(result).toEqual({ allowed: true, tier: 'nano', shouldAbort: false })
    })
  })
})
