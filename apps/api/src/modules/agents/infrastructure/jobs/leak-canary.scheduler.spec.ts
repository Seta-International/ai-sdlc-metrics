/**
 * leak-canary.scheduler.spec.ts — Plan 07 R-07.38a (remediation: Theme E Sub-fix C)
 *
 * The leak canary scan is formally deferred until a trace backend is deployed
 * (per Plan 07 §1 Out-of-scope: "Trace backend selection, deployment, and ops").
 *
 * Path B chosen: the stub is replaced with an explicit deferred-runbook audit
 * that makes the deferral visible in the metric stream. The old silently-clean
 * stub gave false confidence; the new code emits 'deferred' so operators see
 * the gap rather than a green that means nothing.
 *
 * Covers:
 *  1. run() records 'deferred' metric (not 'clean') via recordLeakCanary
 *  2. run() does NOT record 'clean' (guards against silent false-positive)
 *  3. registerJob() schedules with the correct job name and cron expression
 *  4. registerJob() registers a worker for the correct job name
 *  5. worker callback delegates to run()
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
    it("records 'deferred' metric — scan is deferred until trace backend is deployed", async () => {
      await scheduler.run()

      expect(recordLeakCanary).toHaveBeenCalledOnce()
      expect(recordLeakCanary).toHaveBeenCalledWith('deferred')
    })

    it("does NOT record 'clean' — false-positive clean signal is eliminated", async () => {
      await scheduler.run()

      const calls = vi.mocked(recordLeakCanary).mock.calls
      const recordedClean = calls.some(([arg]) => arg === 'clean')
      expect(recordedClean).toBe(false)
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

    it("worker callback delegates to run() and records 'deferred'", async () => {
      await scheduler.registerJob()

      const [, workerFn] = pgBossService.registerScheduledWorker.mock.calls[0]!
      await workerFn()

      expect(recordLeakCanary).toHaveBeenCalledOnce()
      expect(recordLeakCanary).toHaveBeenCalledWith('deferred')
    })
  })
})
