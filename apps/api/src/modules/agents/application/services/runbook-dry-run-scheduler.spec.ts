import { describe, it, expect, beforeEach, vi } from 'vitest'
import { RunbookDryRunScheduler } from './runbook-dry-run-scheduler'
import type { RunbookDryRunRepository } from '../../domain/repositories/runbook-dry-run.repository'

// ─── Mock ──────────────────────────────────────────────────────────────────────

function makeRepo(): RunbookDryRunRepository {
  return {
    insert: vi.fn().mockResolvedValue({
      id: 'run-uuid-1',
      tenantId: 'tenant-1',
      runbookId: 'provider_outage',
      executedAt: new Date(),
      executedBy: 'alice@example.com',
      outcome: 'pass',
      postMortemUrl: null,
      timeToRecoveryMinutes: null,
    }),
    findByRunbookId: vi.fn().mockResolvedValue([]),
    getLastPassByRunbookId: vi.fn().mockResolvedValue(null),
    getCoverage: vi.fn().mockResolvedValue({}),
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('RunbookDryRunScheduler', () => {
  let repo: ReturnType<typeof makeRepo>
  let service: RunbookDryRunScheduler

  beforeEach(() => {
    repo = makeRepo()
    service = new RunbookDryRunScheduler(repo as never)
  })

  // ── schedule ────────────────────────────────────────────────────────────────

  it('schedule() resolves without error for a valid runbookId', async () => {
    await expect(
      service.schedule({
        runbookId: 'provider_outage',
        tenantId: 'tenant-1',
        scheduledAt: new Date(),
        assignedTo: 'alice@example.com',
      }),
    ).resolves.toBeUndefined()
  })

  it('schedule() does NOT call repository.insert (scheduling is a pg-boss concern wired in Task 8)', async () => {
    await service.schedule({
      runbookId: 'provider_outage',
      tenantId: 'tenant-1',
      scheduledAt: new Date('2026-05-01T09:00:00Z'),
      assignedTo: 'alice@example.com',
    })

    expect(repo.insert).not.toHaveBeenCalled()
  })

  it('schedule() resolves for every known runbookId', async () => {
    const validIds = [
      'provider_outage',
      'budget_exhaustion_midflight',
      'quality_canary_degradation',
      'cross_tenant_leak_alert',
      'content_hash_store_miss',
      'adapter_dropped_cache_fields',
      'approval_inbox_flood',
      'gdpr_erasure_partial_success',
    ] as const

    for (const id of validIds) {
      await expect(
        service.schedule({
          runbookId: id,
          tenantId: 't',
          scheduledAt: new Date(),
          assignedTo: 'a',
        }),
      ).resolves.toBeUndefined()
    }
  })

  it('schedule() throws for an unknown runbookId', async () => {
    await expect(
      service.schedule({
        runbookId: 'totally_unknown' as never,
        tenantId: 'tenant-1',
        scheduledAt: new Date(),
        assignedTo: 'alice@example.com',
      }),
    ).rejects.toThrow('unknown runbookId: totally_unknown')
  })

  // ── logRun ──────────────────────────────────────────────────────────────────

  it('logRun() calls repository.insert with the correct fields', async () => {
    await service.logRun({
      runbookId: 'budget_exhaustion_midflight',
      tenantId: 'tenant-2',
      executedBy: 'bob@example.com',
      outcome: 'pass_with_notes',
      timeToRecoveryMinutes: 45,
      postMortemUrl: 'https://example.com/post-mortem/1',
    })

    expect(repo.insert).toHaveBeenCalledTimes(1)
    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-2',
        runbookId: 'budget_exhaustion_midflight',
        executedBy: 'bob@example.com',
        outcome: 'pass_with_notes',
        timeToRecoveryMinutes: 45,
        postMortemUrl: 'https://example.com/post-mortem/1',
      }),
    )
  })

  it('logRun() sets executedAt to approximately now', async () => {
    const before = Date.now()
    await service.logRun({
      runbookId: 'approval_inbox_flood',
      tenantId: 'tenant-1',
      executedBy: 'carol@example.com',
      outcome: 'fail',
    })
    const after = Date.now()

    const insertArg = (repo.insert as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      executedAt: Date
    }
    const executedAtMs = insertArg.executedAt.getTime()
    expect(executedAtMs).toBeGreaterThanOrEqual(before)
    expect(executedAtMs).toBeLessThanOrEqual(after)
  })

  it('logRun() sets null defaults for optional fields when not provided', async () => {
    await service.logRun({
      runbookId: 'gdpr_erasure_partial_success',
      tenantId: 'tenant-1',
      executedBy: 'dave@example.com',
      outcome: 'pass',
    })

    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        postMortemUrl: null,
        timeToRecoveryMinutes: null,
      }),
    )
  })

  // ── getCoverage ─────────────────────────────────────────────────────────────

  it('getCoverage() delegates to repository.getCoverage', async () => {
    const mockResult = {
      provider_outage: { lastPassAt: new Date('2026-04-01'), passCount: 3 },
    }
    ;(repo.getCoverage as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult)

    const result = await service.getCoverage({ lookbackDays: 90 })

    expect(repo.getCoverage).toHaveBeenCalledTimes(1)
    expect(repo.getCoverage).toHaveBeenCalledWith({ lookbackDays: 90 })
    expect(result).toBe(mockResult)
  })

  it('getCoverage() defaults to 180-day lookback when lookbackDays is omitted', async () => {
    await service.getCoverage({})

    expect(repo.getCoverage).toHaveBeenCalledWith({ lookbackDays: 180 })
  })

  it('getCoverage() with no arguments defaults to 180-day lookback', async () => {
    await service.getCoverage()

    expect(repo.getCoverage).toHaveBeenCalledWith({ lookbackDays: 180 })
  })
})
