import { describe, expect, it, vi } from 'vitest'
import type { PgBossService } from '../../../../common/jobs/pg-boss.service'
import type { ReadinessValidator } from '../../application/services/readiness-validator'
import type { GaReadinessComputer } from '../../application/services/ga-readiness-computer'
import { READINESS_HOURLY_JOB, ReadinessHourlyWorker } from './readiness-hourly-worker'

function makeMockBoss(): {
  schedule: ReturnType<typeof vi.fn>
  registerScheduledWorker: ReturnType<typeof vi.fn>
} {
  return {
    schedule: vi.fn().mockResolvedValue(undefined),
    registerScheduledWorker: vi.fn(),
  }
}

describe('ReadinessHourlyWorker', () => {
  it('registers an hourly cron schedule and a single-concurrency worker', async () => {
    const mockBoss = makeMockBoss()
    const validator = {
      evaluateAll: vi.fn().mockResolvedValue({}),
    } as unknown as ReadinessValidator
    const computer = {
      compute: vi.fn().mockResolvedValue(undefined),
    } as unknown as GaReadinessComputer

    const worker = new ReadinessHourlyWorker(
      mockBoss as unknown as PgBossService,
      validator,
      computer,
    )

    await worker.onApplicationBootstrap()

    expect(mockBoss.schedule).toHaveBeenCalledTimes(1)
    expect(mockBoss.schedule).toHaveBeenCalledWith(READINESS_HOURLY_JOB, '0 * * * *')

    expect(mockBoss.registerScheduledWorker).toHaveBeenCalledTimes(1)
    expect(mockBoss.registerScheduledWorker).toHaveBeenCalledWith(
      READINESS_HOURLY_JOB,
      expect.any(Function),
      { localConcurrency: 1 },
    )
  })

  it('calls validator.evaluateAll() then computer.compute() when the worker fires', async () => {
    const mockBoss = makeMockBoss()
    const callOrder: string[] = []
    const evaluateAll = vi.fn().mockImplementation(async () => {
      callOrder.push('evaluateAll')
    })
    const compute = vi.fn().mockImplementation(async () => {
      callOrder.push('compute')
    })
    const validator = { evaluateAll } as unknown as ReadinessValidator
    const computer = { compute } as unknown as GaReadinessComputer

    const scheduler = new ReadinessHourlyWorker(
      mockBoss as unknown as PgBossService,
      validator,
      computer,
    )

    await scheduler.onApplicationBootstrap()

    const handler = mockBoss.registerScheduledWorker.mock.calls[0][1] as () => Promise<void>
    await handler()

    expect(evaluateAll).toHaveBeenCalledTimes(1)
    expect(compute).toHaveBeenCalledTimes(1)
    expect(callOrder).toEqual(['evaluateAll', 'compute'])
  })

  it('propagates errors from validator.evaluateAll() so pg-boss records the failure', async () => {
    const mockBoss = makeMockBoss()
    const evaluateAll = vi.fn().mockRejectedValue(new Error('validator boom'))
    const compute = vi.fn().mockResolvedValue(undefined)
    const validator = { evaluateAll } as unknown as ReadinessValidator
    const computer = { compute } as unknown as GaReadinessComputer

    const scheduler = new ReadinessHourlyWorker(
      mockBoss as unknown as PgBossService,
      validator,
      computer,
    )

    await scheduler.onApplicationBootstrap()

    const handler = mockBoss.registerScheduledWorker.mock.calls[0][1] as () => Promise<void>
    await expect(handler()).rejects.toThrow('validator boom')
    expect(evaluateAll).toHaveBeenCalledTimes(1)
    expect(compute).not.toHaveBeenCalled()
  })
})
