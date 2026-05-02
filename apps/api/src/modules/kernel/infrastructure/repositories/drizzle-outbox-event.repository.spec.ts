import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DrizzleOutboxEventRepository } from './drizzle-outbox-event.repository'
import { outboxEvent } from '../schema/index'

describe('DrizzleOutboxEventRepository', () => {
  let repo: DrizzleOutboxEventRepository
  let valuesMock: ReturnType<typeof vi.fn>
  let limitMock: ReturnType<typeof vi.fn>
  let db: { insert: ReturnType<typeof vi.fn>; select: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    valuesMock = vi.fn().mockResolvedValue(undefined)
    limitMock = vi.fn().mockResolvedValue([])
    const orderByMock = vi.fn().mockReturnValue({ limit: limitMock })
    const whereMock = vi.fn().mockReturnValue({ orderBy: orderByMock })
    const fromMock = vi.fn().mockReturnValue({ where: whereMock })
    db = {
      insert: vi.fn().mockReturnValue({ values: valuesMock }),
      select: vi.fn().mockReturnValue({ from: fromMock }),
    }
    repo = new DrizzleOutboxEventRepository(db as unknown as import('@future/db').Db)
  })

  it('calls db.insert(...).values(...) with correct data', async () => {
    const data = {
      tenantId: 'tenant-1',
      eventName: 'user.created',
      payload: { foo: 'bar' },
    }

    await repo.insert(data)

    expect(db.insert).toHaveBeenCalledOnce()
    expect(db.insert).toHaveBeenCalledWith(outboxEvent)
    expect(valuesMock).toHaveBeenCalledOnce()
    expect(valuesMock).toHaveBeenCalledWith({
      tenantId: data.tenantId,
      eventName: data.eventName,
      payload: data.payload,
    })
  })

  it('returns void on success', async () => {
    const result = await repo.insert({
      tenantId: 'tenant-1',
      eventName: 'test.event',
      payload: {},
    })

    expect(result).toBeUndefined()
  })

  it('propagates db errors', async () => {
    valuesMock.mockRejectedValue(new Error('DB connection lost'))
    await expect(
      repo.insert({
        tenantId: 'tenant-1',
        eventName: 'actor.offboarded',
        payload: { actorId: 'actor-1' },
      }),
    ).rejects.toThrow('DB connection lost')
  })

  it('findLatestByJobId returns null when no rows found', async () => {
    limitMock.mockResolvedValue([])

    const result = await repo.findLatestByJobId('job-1', 'planner.ms_sync.backfill_progress')

    expect(result).toBeNull()
  })

  it('findLatestByJobId returns payload of latest row', async () => {
    const payload = { processed: 3, total: 10, jobId: 'job-1' }
    limitMock.mockResolvedValue([{ payload }])

    const result = await repo.findLatestByJobId('job-1', 'planner.ms_sync.backfill_progress')

    expect(result).toEqual({ payload })
  })

  it('findLatestByJobId calls select with correct args', async () => {
    limitMock.mockResolvedValue([])

    await repo.findLatestByJobId('job-abc', 'some.event')

    expect(db.select).toHaveBeenCalledWith({ payload: outboxEvent.payload })
  })
})
