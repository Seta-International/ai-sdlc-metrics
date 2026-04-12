import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgBossService } from './pg-boss.service'

const { mockBoss } = vi.hoisted(() => {
  return {
    mockBoss: {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockResolvedValue('test-job-id'),
      work: vi.fn().mockResolvedValue(undefined),
    },
  }
})

vi.mock('pg-boss', () => {
  class MockPgBoss {
    constructor(_connectionString: string) {}
    start = mockBoss.start
    stop = mockBoss.stop
    send = mockBoss.send
    work = mockBoss.work
  }

  return {
    default: MockPgBoss,
  }
})

describe('PgBossService', () => {
  let service: PgBossService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new PgBossService('postgresql://localhost/test')
  })

  it('starts pg-boss on bootstrap', async () => {
    await service.onApplicationBootstrap()
    expect(mockBoss.start).toHaveBeenCalledOnce()
  })

  it('stops pg-boss on shutdown', async () => {
    await service.onApplicationBootstrap()
    await service.onApplicationShutdown()
    expect(mockBoss.stop).toHaveBeenCalledOnce()
  })

  it('enqueues a job and returns job id', async () => {
    await service.onApplicationBootstrap()
    const id = await service.enqueue('documents.generate', { jobId: 'abc' })
    expect(mockBoss.send).toHaveBeenCalledWith('documents.generate', { jobId: 'abc' }, {})
    expect(id).toBe('test-job-id')
  })

  it('registers a worker', async () => {
    await service.onApplicationBootstrap()
    const handler = vi.fn()
    service.registerWorker('documents.generate', handler)
    expect(mockBoss.work).toHaveBeenCalledWith('documents.generate', handler)
  })
})
