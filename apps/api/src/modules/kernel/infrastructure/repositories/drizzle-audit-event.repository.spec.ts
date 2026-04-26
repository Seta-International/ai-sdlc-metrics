import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DrizzleAuditEventRepository } from './drizzle-audit-event.repository'
import { auditEvent } from '../schema/index'

describe('DrizzleAuditEventRepository', () => {
  let repo: DrizzleAuditEventRepository
  let valuesMock: ReturnType<typeof vi.fn>
  let db: { insert: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    valuesMock = vi.fn().mockResolvedValue(undefined)
    db = {
      insert: vi.fn().mockReturnValue({ values: valuesMock }),
    }
    repo = new DrizzleAuditEventRepository(db as unknown as import('@future/db').Db)
  })

  it('calls db.insert(...).values(...) with correct data', async () => {
    const data = {
      tenantId: 'tenant-1',
      actorId: 'actor-1',
      eventType: 'user.created',
      module: 'kernel',
      subjectId: 'subject-1',
      payload: { foo: 'bar' },
    }

    await repo.insert(data)

    expect(db.insert).toHaveBeenCalledOnce()
    expect(db.insert).toHaveBeenCalledWith(auditEvent)
    expect(valuesMock).toHaveBeenCalledOnce()
    expect(valuesMock).toHaveBeenCalledWith({
      tenantId: data.tenantId,
      actorId: data.actorId,
      eventType: data.eventType,
      module: data.module,
      subjectId: data.subjectId,
      payload: data.payload,
      flowId: null,
      intentSlug: null,
    })
  })

  it('returns void on success', async () => {
    const result = await repo.insert({
      tenantId: 'tenant-1',
      actorId: 'actor-1',
      eventType: 'test.event',
      module: 'kernel',
      subjectId: 'subject-1',
      payload: {},
    })

    expect(result).toBeUndefined()
  })

  it('propagates db errors', async () => {
    valuesMock.mockRejectedValue(new Error('DB connection lost'))
    await expect(
      repo.insert({
        tenantId: 'tenant-1',
        actorId: 'actor-1',
        eventType: 'actor.created',
        module: 'kernel',
        subjectId: 'actor-1',
        payload: { foo: 'bar' },
      }),
    ).rejects.toThrow('DB connection lost')
  })
})
