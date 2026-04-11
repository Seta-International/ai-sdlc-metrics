import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DrizzleOutboxEventRepository } from './drizzle-outbox-event.repository'
import { outboxEvent } from '../schema/index'

describe('DrizzleOutboxEventRepository', () => {
  let repo: DrizzleOutboxEventRepository
  let valuesMock: ReturnType<typeof vi.fn>
  let db: { insert: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    valuesMock = vi.fn().mockResolvedValue(undefined)
    db = {
      insert: vi.fn().mockReturnValue({ values: valuesMock }),
    }
    repo = new DrizzleOutboxEventRepository(db as any)
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
})
