/**
 * leak-canary.scheduler.spec.ts — Plan 07 Task 7
 *
 * Covers:
 *  1. run() records 'clean' metric via recordLeakCanary
 *  2. registerJob() schedules with the correct job name and cron expression
 *  3. registerJob() registers a worker for the correct job name
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LeakCanaryScheduler, LEAK_CANARY_JOB_NAME } from './leak-canary.scheduler'

// ─── Mock observability-metrics ───────────────────────────────────────────────

vi.mock('../observability/observability-metrics', () => ({
  recordLeakCanary: vi.fn(),
}))

import { recordLeakCanary } from '../observability/observability-metrics'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePgBossService() {
  return {
    schedule: vi.fn().mockResolvedValue(undefined),
    registerScheduledWorker: vi.fn(),
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LeakCanaryScheduler', () => {
  let pgBossService: ReturnType<typeof makePgBossService>
  let scheduler: LeakCanaryScheduler

  beforeEach(() => {
    vi.clearAllMocks()
    pgBossService = makePgBossService()
    scheduler = new LeakCanaryScheduler(pgBossService as never)
  })

  describe('run()', () => {
    it("records 'clean' metric via recordLeakCanary", async () => {
      await scheduler.run()

      expect(recordLeakCanary).toHaveBeenCalledOnce()
      expect(recordLeakCanary).toHaveBeenCalledWith('clean')
    })
  })

  describe('registerJob()', () => {
    it('schedules the observability-leak-canary job with a 3am UTC daily cron', async () => {
      await scheduler.registerJob()

      expect(pgBossService.schedule).toHaveBeenCalledOnce()
      expect(pgBossService.schedule).toHaveBeenCalledWith(LEAK_CANARY_JOB_NAME, '0 3 * * *')
    })

    it('registers a scheduled worker for observability-leak-canary', async () => {
      await scheduler.registerJob()

      expect(pgBossService.registerScheduledWorker).toHaveBeenCalledOnce()
      expect(pgBossService.registerScheduledWorker).toHaveBeenCalledWith(
        LEAK_CANARY_JOB_NAME,
        expect.any(Function),
      )
    })

    it('worker callback delegates to run()', async () => {
      await scheduler.registerJob()

      const [, workerFn] = pgBossService.registerScheduledWorker.mock.calls[0]!
      await workerFn()

      expect(recordLeakCanary).toHaveBeenCalledOnce()
      expect(recordLeakCanary).toHaveBeenCalledWith('clean')
    })
  })
})
