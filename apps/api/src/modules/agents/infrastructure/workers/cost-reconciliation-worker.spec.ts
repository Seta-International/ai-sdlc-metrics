import { Logger } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import type { PgBossService } from '../../../../common/jobs/pg-boss.service'
import type { CostReconciliationJob } from '../../application/services/cost-reconciliation-job'
import { COST_RECONCILIATION_JOB, CostReconciliationWorker } from './cost-reconciliation-worker'

function makeMockBoss(): {
  schedule: ReturnType<typeof vi.fn>
  registerScheduledWorker: ReturnType<typeof vi.fn>
} {
  return {
    schedule: vi.fn().mockResolvedValue(undefined),
    registerScheduledWorker: vi.fn(),
  }
}

function makeDb(total: string | null = '42.123456') {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ total }]),
      }),
    }),
  }
}

describe('CostReconciliationWorker', () => {
  it('registers a Monday 08:00 UTC cron schedule and a single-concurrency worker', async () => {
    const mockBoss = makeMockBoss()
    const job = { runWeekly: vi.fn().mockResolvedValue({}) } as unknown as CostReconciliationJob
    const db = makeDb()

    const worker = new CostReconciliationWorker(
      mockBoss as unknown as PgBossService,
      job,
      db as unknown as Parameters<typeof CostReconciliationWorker.prototype.registerWorker>[0],
    )

    await worker.registerWorker()

    expect(mockBoss.schedule).toHaveBeenCalledTimes(1)
    expect(mockBoss.schedule).toHaveBeenCalledWith(COST_RECONCILIATION_JOB, '0 8 * * 1')

    expect(mockBoss.registerScheduledWorker).toHaveBeenCalledTimes(1)
    expect(mockBoss.registerScheduledWorker).toHaveBeenCalledWith(
      COST_RECONCILIATION_JOB,
      expect.any(Function),
      { localConcurrency: 1 },
    )
  })

  it('queries DB for last week and calls job.runWeekly() with correct weekStart format', async () => {
    const mockBoss = makeMockBoss()
    const runWeekly = vi.fn().mockResolvedValue({})
    const job = { runWeekly } as unknown as CostReconciliationJob
    const db = makeDb('99.500000')

    const worker = new CostReconciliationWorker(
      mockBoss as unknown as PgBossService,
      job,
      db as unknown as Parameters<typeof CostReconciliationWorker.prototype.registerWorker>[0],
    )

    await worker.registerWorker()

    const handler = mockBoss.registerScheduledWorker.mock.calls[0][1] as () => Promise<void>
    await handler()

    expect(runWeekly).toHaveBeenCalledTimes(1)
    const callArgs = runWeekly.mock.calls[0][0] as {
      weekStart: string
      agentCostEventSumUsd: string
      vendorInvoiceSumUsd: string
    }
    // weekStart must be YYYY-MM-DD format
    expect(callArgs.weekStart).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // weekStart must be a Monday (day 1 in UTC)
    expect(new Date(callArgs.weekStart).getUTCDay()).toBe(1)
    // both sums should equal the DB total
    expect(callArgs.agentCostEventSumUsd).toBe('99.500000')
    expect(callArgs.vendorInvoiceSumUsd).toBe('99.500000')
  })

  it('propagates errors from job.runWeekly() so pg-boss records the failure', async () => {
    const mockBoss = makeMockBoss()
    const runWeekly = vi.fn().mockRejectedValue(new Error('reconciliation boom'))
    const job = { runWeekly } as unknown as CostReconciliationJob
    const db = makeDb('10.000000')

    const worker = new CostReconciliationWorker(
      mockBoss as unknown as PgBossService,
      job,
      db as unknown as Parameters<typeof CostReconciliationWorker.prototype.registerWorker>[0],
    )

    await worker.registerWorker()

    const handler = mockBoss.registerScheduledWorker.mock.calls[0][1] as () => Promise<void>
    await expect(handler()).rejects.toThrow('reconciliation boom')
    expect(runWeekly).toHaveBeenCalledTimes(1)
  })

  it('logs warn when divergenceOverThreshold is true', async () => {
    const mockBoss = makeMockBoss()
    const runWeekly = vi.fn().mockResolvedValue({
      divergenceOverThreshold: true,
      divergencePct: '3.5000',
      weekStart: '2026-04-20',
      agentCostEventSumUsd: '100.000000',
      vendorInvoiceSumUsd: '96.500000',
      computedAt: new Date(),
      id: 'test-id',
      tenantId: 'tenant-1',
    })
    const job = { runWeekly } as unknown as CostReconciliationJob
    const db = makeDb('100.000000')

    const worker = new CostReconciliationWorker(
      mockBoss as unknown as PgBossService,
      job,
      db as unknown as Parameters<typeof CostReconciliationWorker.prototype.registerWorker>[0],
    )

    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})

    await worker.registerWorker()

    const handler = mockBoss.registerScheduledWorker.mock.calls[0][1] as () => Promise<void>
    await handler()

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('threshold'))
    warnSpy.mockRestore()
  })

  it('uses "0" when agent_cost_event sum is null (empty week)', async () => {
    const mockBoss = makeMockBoss()
    const runWeekly = vi.fn().mockResolvedValue({
      divergenceOverThreshold: false,
      divergencePct: '0.0000',
      weekStart: '2026-04-20',
      agentCostEventSumUsd: '0',
      vendorInvoiceSumUsd: '0',
      computedAt: new Date(),
      id: 'test-id',
      tenantId: 'tenant-1',
    })
    const job = { runWeekly } as unknown as CostReconciliationJob
    const db = makeDb(null)

    const worker = new CostReconciliationWorker(
      mockBoss as unknown as PgBossService,
      job,
      db as unknown as Parameters<typeof CostReconciliationWorker.prototype.registerWorker>[0],
    )

    await worker.registerWorker()

    const handler = mockBoss.registerScheduledWorker.mock.calls[0][1] as () => Promise<void>
    await handler()

    expect(runWeekly).toHaveBeenCalledTimes(1)
    const callArgs = runWeekly.mock.calls[0][0] as {
      weekStart: string
      agentCostEventSumUsd: string
      vendorInvoiceSumUsd: string
    }
    expect(callArgs.agentCostEventSumUsd).toBe('0')
    expect(callArgs.vendorInvoiceSumUsd).toBe('0')
  })

  it('getLastWeekBounds() returns Monday-to-Monday range spanning 7 days', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-27T10:00:00.000Z')) // a Monday

    try {
      const mockBoss = makeMockBoss()
      const job = { runWeekly: vi.fn() } as unknown as CostReconciliationJob
      const db = makeDb()

      const worker = new CostReconciliationWorker(
        mockBoss as unknown as PgBossService,
        job,
        db as unknown as Parameters<typeof CostReconciliationWorker.prototype.registerWorker>[0],
      )

      const { weekStart, weekEnd } = (
        worker as unknown as { getLastWeekBounds: () => { weekStart: Date; weekEnd: Date } }
      ).getLastWeekBounds()

      // Both weekStart and weekEnd should be Mondays
      expect(weekStart.getUTCDay()).toBe(1)
      expect(weekEnd.getUTCDay()).toBe(1)

      // weekEnd - weekStart = exactly 7 days
      const diffMs = weekEnd.getTime() - weekStart.getTime()
      expect(diffMs).toBe(7 * 24 * 60 * 60 * 1000)

      // Last Monday from 2026-04-27 (Mon) is 2026-04-20
      expect(weekStart.toISOString().slice(0, 10)).toBe('2026-04-20')
      expect(weekEnd.toISOString().slice(0, 10)).toBe('2026-04-27')
    } finally {
      vi.useRealTimers()
    }
  })
})
