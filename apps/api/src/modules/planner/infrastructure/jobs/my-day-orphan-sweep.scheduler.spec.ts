import { describe, expect, it, vi } from 'vitest'
import type { PgBossService } from '../../../../common/jobs/pg-boss.service'
import { MyDayOrphanSweepJob } from './my-day-orphan-sweep.job'
import { MY_DAY_ORPHAN_SWEEP_JOB, MyDayOrphanSweepScheduler } from './my-day-orphan-sweep.scheduler'

function makeMockBoss(): {
  schedule: ReturnType<typeof vi.fn>
  registerScheduledWorker: ReturnType<typeof vi.fn>
} {
  return {
    schedule: vi.fn().mockResolvedValue(undefined),
    registerScheduledWorker: vi.fn(),
  }
}

describe('MyDayOrphanSweepScheduler', () => {
  it('registers a daily 03:00 UTC schedule and a single-concurrency worker', async () => {
    const mockBoss = makeMockBoss()
    const job = { handle: vi.fn().mockResolvedValue(undefined) } as unknown as MyDayOrphanSweepJob

    const scheduler = new MyDayOrphanSweepScheduler(mockBoss as unknown as PgBossService, job)

    await scheduler.onApplicationBootstrap()

    expect(mockBoss.schedule).toHaveBeenCalledTimes(1)
    expect(mockBoss.schedule).toHaveBeenCalledWith(MY_DAY_ORPHAN_SWEEP_JOB, '0 3 * * *')

    expect(mockBoss.registerScheduledWorker).toHaveBeenCalledTimes(1)
    expect(mockBoss.registerScheduledWorker).toHaveBeenCalledWith(
      MY_DAY_ORPHAN_SWEEP_JOB,
      expect.any(Function),
      { localConcurrency: 1 },
    )
  })

  it('invokes job.handle() when the registered worker function fires', async () => {
    const mockBoss = makeMockBoss()
    const handle = vi.fn().mockResolvedValue(undefined)
    const job = { handle } as unknown as MyDayOrphanSweepJob

    const scheduler = new MyDayOrphanSweepScheduler(mockBoss as unknown as PgBossService, job)

    await scheduler.onApplicationBootstrap()

    const worker = mockBoss.registerScheduledWorker.mock.calls[0][1] as () => Promise<void>
    await worker()

    expect(handle).toHaveBeenCalledTimes(1)
  })

  it('propagates errors from job.handle() so pg-boss records the failure', async () => {
    const mockBoss = makeMockBoss()
    const handle = vi.fn().mockRejectedValue(new Error('boom'))
    const job = { handle } as unknown as MyDayOrphanSweepJob

    const scheduler = new MyDayOrphanSweepScheduler(mockBoss as unknown as PgBossService, job)

    await scheduler.onApplicationBootstrap()

    const worker = mockBoss.registerScheduledWorker.mock.calls[0][1] as () => Promise<void>
    await expect(worker()).rejects.toThrow('boom')
    expect(handle).toHaveBeenCalledTimes(1)
  })
})
