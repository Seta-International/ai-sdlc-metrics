import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CostReconciliationJob } from './cost-reconciliation-job'
import type { CostReconciliationRepository } from '../../domain/repositories/cost-reconciliation.repository'

// ─── Mock factories ────────────────────────────────────────────────────────────

function makeReconciliationRepo(): CostReconciliationRepository {
  return {
    insert: vi.fn().mockImplementation(async (rec) => ({ id: 'rec-uuid-1', ...rec })),
    findByWeekStart: vi.fn().mockResolvedValue(null),
    findRecent: vi.fn().mockResolvedValue([]),
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('CostReconciliationJob', () => {
  let repo: ReturnType<typeof makeReconciliationRepo>
  let job: CostReconciliationJob

  beforeEach(() => {
    repo = makeReconciliationRepo()
    job = new CostReconciliationJob(repo as never)
  })

  // ── runWeekly ───────────────────────────────────────────────────────────────

  it('agent=100 vendor=103 → divergencePct ≈ 2.91%, divergenceOverThreshold=true', async () => {
    const result = await job.runWeekly({
      weekStart: '2026-04-20',
      agentCostEventSumUsd: '100',
      vendorInvoiceSumUsd: '103',
    })

    // |100 - 103| / 103 * 100 = 2.9126...%
    const pct = Number(result.divergencePct)
    expect(pct).toBeCloseTo(2.9126, 2)
    expect(result.divergenceOverThreshold).toBe(true)
  })

  it('agent=100 vendor=101 → divergencePct ≈ 0.99%, divergenceOverThreshold=false', async () => {
    const result = await job.runWeekly({
      weekStart: '2026-04-20',
      agentCostEventSumUsd: '100',
      vendorInvoiceSumUsd: '101',
    })

    // |100 - 101| / 101 * 100 = 0.9901...%
    const pct = Number(result.divergencePct)
    expect(pct).toBeCloseTo(0.9901, 2)
    expect(result.divergenceOverThreshold).toBe(false)
  })

  it('vendor=0 → divergencePct=0, no division-by-zero', async () => {
    const result = await job.runWeekly({
      weekStart: '2026-04-20',
      agentCostEventSumUsd: '50',
      vendorInvoiceSumUsd: '0',
    })

    expect(Number(result.divergencePct)).toBe(0)
    expect(result.divergenceOverThreshold).toBe(false)
  })

  it('divergence exactly 2% does not set divergenceOverThreshold', async () => {
    // agent=102, vendor=100 → |102-100|/100 * 100 = 2.0% → NOT over threshold
    const result = await job.runWeekly({
      weekStart: '2026-04-20',
      agentCostEventSumUsd: '102',
      vendorInvoiceSumUsd: '100',
    })

    const pct = Number(result.divergencePct)
    expect(pct).toBeCloseTo(2.0, 4)
    expect(result.divergenceOverThreshold).toBe(false)
  })

  it('agent=vendor → divergencePct=0, divergenceOverThreshold=false', async () => {
    const result = await job.runWeekly({
      weekStart: '2026-04-20',
      agentCostEventSumUsd: '500',
      vendorInvoiceSumUsd: '500',
    })

    expect(Number(result.divergencePct)).toBe(0)
    expect(result.divergenceOverThreshold).toBe(false)
  })

  it('persists a reconciliation row via repo.insert', async () => {
    await job.runWeekly({
      weekStart: '2026-04-13',
      agentCostEventSumUsd: '200',
      vendorInvoiceSumUsd: '198',
    })

    expect(repo.insert).toHaveBeenCalledTimes(1)
    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        weekStart: '2026-04-13',
        agentCostEventSumUsd: '200',
        vendorInvoiceSumUsd: '198',
      }),
    )
  })

  it('returns the persisted entity from repo.insert', async () => {
    const mockEntity = {
      id: 'fixed-uuid',
      weekStart: '2026-04-20',
      agentCostEventSumUsd: '100',
      vendorInvoiceSumUsd: '100',
      divergencePct: '0.0000',
      divergenceOverThreshold: false,
      computedAt: new Date(),
    }
    ;(repo.insert as ReturnType<typeof vi.fn>).mockResolvedValue(mockEntity)

    const result = await job.runWeekly({
      weekStart: '2026-04-20',
      agentCostEventSumUsd: '100',
      vendorInvoiceSumUsd: '100',
    })

    expect(result).toBe(mockEntity)
  })

  // ── checkLastWeekAlert ──────────────────────────────────────────────────────

  it('checkLastWeekAlert() returns true when last row has divergenceOverThreshold=true', async () => {
    ;(repo.findRecent as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'rec-1',
        weekStart: '2026-04-20',
        agentCostEventSumUsd: '100',
        vendorInvoiceSumUsd: '103',
        divergencePct: '2.9126',
        divergenceOverThreshold: true,
        computedAt: new Date(),
      },
    ])

    const result = await job.checkLastWeekAlert()
    expect(result).toBe(true)
    expect(repo.findRecent).toHaveBeenCalledWith({ limit: 1 })
  })

  it('checkLastWeekAlert() returns false when last row has divergenceOverThreshold=false', async () => {
    ;(repo.findRecent as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'rec-2',
        weekStart: '2026-04-20',
        agentCostEventSumUsd: '100',
        vendorInvoiceSumUsd: '100',
        divergencePct: '0.0000',
        divergenceOverThreshold: false,
        computedAt: new Date(),
      },
    ])

    const result = await job.checkLastWeekAlert()
    expect(result).toBe(false)
  })

  it('checkLastWeekAlert() returns false when no rows exist', async () => {
    ;(repo.findRecent as ReturnType<typeof vi.fn>).mockResolvedValue([])

    const result = await job.checkLastWeekAlert()
    expect(result).toBe(false)
  })
})
