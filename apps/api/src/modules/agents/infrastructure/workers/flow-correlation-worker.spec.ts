import { Logger } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import type { PgBossService } from '../../../../common/jobs/pg-boss.service'
import type { FlowCorrelationProbe } from '../../application/services/flow-correlation-probe'
import type { CorrelationResult } from '../../application/services/flow-correlation-probe'
import { FLOW_CORRELATION_JOB, FlowCorrelationWorker } from './flow-correlation-worker'

function makeMockBoss(): {
  schedule: ReturnType<typeof vi.fn>
  registerScheduledWorker: ReturnType<typeof vi.fn>
} {
  return {
    schedule: vi.fn().mockResolvedValue(undefined),
    registerScheduledWorker: vi.fn(),
  }
}

function makeCleanResult(): CorrelationResult {
  return {
    ranAt: new Date(),
    sampleSize: 100,
    dangles: [],
    zeroDangle: true,
  }
}

describe('FlowCorrelationWorker', () => {
  it('registers a monthly (1st of month 06:00 UTC) cron and a single-concurrency worker', async () => {
    const mockBoss = makeMockBoss()
    const probe = {
      sample: vi.fn().mockResolvedValue(makeCleanResult()),
    } as unknown as FlowCorrelationProbe

    const worker = new FlowCorrelationWorker(mockBoss as unknown as PgBossService, probe)

    await worker.registerWorker()

    expect(mockBoss.schedule).toHaveBeenCalledTimes(1)
    expect(mockBoss.schedule).toHaveBeenCalledWith(FLOW_CORRELATION_JOB, '0 6 1 * *')

    expect(mockBoss.registerScheduledWorker).toHaveBeenCalledTimes(1)
    expect(mockBoss.registerScheduledWorker).toHaveBeenCalledWith(
      FLOW_CORRELATION_JOB,
      expect.any(Function),
      { localConcurrency: 1 },
    )
  })

  it('calls probe.sample(100) when the worker fires', async () => {
    const mockBoss = makeMockBoss()
    const sample = vi.fn().mockResolvedValue(makeCleanResult())
    const probe = { sample } as unknown as FlowCorrelationProbe

    const worker = new FlowCorrelationWorker(mockBoss as unknown as PgBossService, probe)

    await worker.registerWorker()

    const handler = mockBoss.registerScheduledWorker.mock.calls[0][1] as () => Promise<void>
    await handler()

    expect(sample).toHaveBeenCalledTimes(1)
    expect(sample).toHaveBeenCalledWith(100)
  })

  it('logs a warning when zeroDangle is false', async () => {
    const mockBoss = makeMockBoss()
    const danglingResult: CorrelationResult = {
      ranAt: new Date(),
      sampleSize: 100,
      dangles: [
        { flowId: 'flow-abc', missingFrom: ['span'] },
        { flowId: 'flow-def', missingFrom: ['audit', 'draft'] },
      ],
      zeroDangle: false,
    }
    const probe = {
      sample: vi.fn().mockResolvedValue(danglingResult),
    } as unknown as FlowCorrelationProbe

    const worker = new FlowCorrelationWorker(mockBoss as unknown as PgBossService, probe)
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})

    await worker.registerWorker()

    const handler = mockBoss.registerScheduledWorker.mock.calls[0][1] as () => Promise<void>
    await handler()

    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('dangling'))
    warnSpy.mockRestore()
  })

  it('propagates errors from probe.sample() so pg-boss records the failure', async () => {
    const mockBoss = makeMockBoss()
    const sample = vi.fn().mockRejectedValue(new Error('probe boom'))
    const probe = { sample } as unknown as FlowCorrelationProbe

    const worker = new FlowCorrelationWorker(mockBoss as unknown as PgBossService, probe)

    await worker.registerWorker()

    const handler = mockBoss.registerScheduledWorker.mock.calls[0][1] as () => Promise<void>
    await expect(handler()).rejects.toThrow('probe boom')
    expect(sample).toHaveBeenCalledTimes(1)
  })
})
