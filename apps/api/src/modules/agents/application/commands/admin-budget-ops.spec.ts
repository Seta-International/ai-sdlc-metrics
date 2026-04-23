/**
 * admin-budget-ops.spec.ts — Plan 05 Task 7 — AdminBudgetOps
 *
 * Covers:
 *  1. topUp updates remaining_usd atomically and emits agent.budget_topup audit event
 *  2. topUp passes amountUsd, tenantId, actorUserId, and reason to audit
 *  3. setDailyLimit updates daily_limit_usd and emits agent.budget_limit_changed audit event
 *  4. setDailyLimit passes new limit and actorUserId to audit
 */

import { describe, it, expect, vi } from 'vitest'
import { AdminBudgetOps } from './admin-budget-ops'
import type { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'

// ─── Mock factories ───────────────────────────────────────────────────────────

function buildDb() {
  const whereMock = vi.fn().mockResolvedValue([])
  const setMock = vi.fn().mockReturnValue({ where: whereMock })
  const updateMock = vi.fn().mockReturnValue({ set: setMock })

  return { db: { update: updateMock } as never, updateMock, setMock, whereMock }
}

function buildAuditFacade() {
  return {
    auditFacade: {
      recordEvent: vi.fn().mockResolvedValue(undefined),
    } as unknown as KernelAuditFacade,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AdminBudgetOps', () => {
  describe('topUp()', () => {
    it('1. updates remaining_usd and emits agent.budget_topup audit event', async () => {
      const { db, updateMock } = buildDb()
      const { auditFacade } = buildAuditFacade()
      const ops = new AdminBudgetOps(db, auditFacade)

      await ops.topUp({
        tenantId: TENANT_ID,
        amountUsd: 50,
        reason: 'manual refill',
        actorUserId: ACTOR_ID,
      })

      expect(updateMock).toHaveBeenCalledOnce()
      expect(auditFacade.recordEvent).toHaveBeenCalledOnce()
      expect(auditFacade.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'agent.budget_topup' }),
      )
    })

    it('2. passes amountUsd, tenantId, actorUserId, and reason to the audit event', async () => {
      const { db } = buildDb()
      const { auditFacade } = buildAuditFacade()
      const ops = new AdminBudgetOps(db, auditFacade)

      await ops.topUp({
        tenantId: TENANT_ID,
        amountUsd: 100,
        reason: 'quarterly top-up',
        actorUserId: ACTOR_ID,
      })

      expect(auditFacade.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          actorId: ACTOR_ID,
          payload: expect.objectContaining({
            amountUsd: 100,
            reason: 'quarterly top-up',
          }),
        }),
      )
    })
  })

  describe('setDailyLimit()', () => {
    it('3. updates daily_limit_usd and emits agent.budget_limit_changed audit event', async () => {
      const { db, updateMock } = buildDb()
      const { auditFacade } = buildAuditFacade()
      const ops = new AdminBudgetOps(db, auditFacade)

      await ops.setDailyLimit({ tenantId: TENANT_ID, amountUsd: 200, actorUserId: ACTOR_ID })

      expect(updateMock).toHaveBeenCalledOnce()
      expect(auditFacade.recordEvent).toHaveBeenCalledOnce()
      expect(auditFacade.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'agent.budget_limit_changed' }),
      )
    })

    it('4. passes new limit and actorUserId to the audit event', async () => {
      const { db } = buildDb()
      const { auditFacade } = buildAuditFacade()
      const ops = new AdminBudgetOps(db, auditFacade)

      await ops.setDailyLimit({ tenantId: TENANT_ID, amountUsd: 75, actorUserId: ACTOR_ID })

      expect(auditFacade.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          actorId: ACTOR_ID,
          payload: expect.objectContaining({
            dailyLimitUsd: 75,
          }),
        }),
      )
    })
  })
})
