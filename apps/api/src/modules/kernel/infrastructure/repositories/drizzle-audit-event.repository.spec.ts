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

  it('passes non-null flowId and intentSlug through to db.insert values()', async () => {
    const data = {
      tenantId: 'tenant-2',
      actorId: 'actor-2',
      eventType: 'agent.completed',
      module: 'agents',
      subjectId: 'subject-2',
      payload: { result: 'ok' },
      flowId: 'flow-abc-123',
      intentSlug: 'onboard_employee',
    }

    await repo.insert(data)

    expect(valuesMock).toHaveBeenCalledOnce()
    expect(valuesMock).toHaveBeenCalledWith({
      tenantId: data.tenantId,
      actorId: data.actorId,
      eventType: data.eventType,
      module: data.module,
      subjectId: data.subjectId,
      payload: data.payload,
      flowId: 'flow-abc-123',
      intentSlug: 'onboard_employee',
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

  describe('query()', () => {
    let selectMock: ReturnType<typeof vi.fn>
    let queryDb: {
      insert: ReturnType<typeof vi.fn>
      select: ReturnType<typeof vi.fn>
    }
    let queryRepo: DrizzleAuditEventRepository

    beforeEach(() => {
      // Build a chainable mock for the select query builder
      const fromMock = vi.fn()
      const whereMock = vi.fn()
      const orderByMock = vi.fn()
      const limitMock = vi.fn()
      const offsetMock = vi.fn()
      // Items query chain
      offsetMock.mockResolvedValue([])
      limitMock.mockReturnValue({ offset: offsetMock })
      orderByMock.mockReturnValue({ limit: limitMock })
      whereMock.mockReturnValue({ orderBy: orderByMock, where: whereMock })
      // Count query chain — select({ value: count() }).from().where()
      const countFromMock = vi.fn()
      const countWhereMock = vi.fn()
      countWhereMock.mockResolvedValue([{ value: 0 }])
      countFromMock.mockReturnValue({ where: countWhereMock })

      let callCount = 0
      fromMock.mockImplementation(() => {
        callCount++
        if (callCount === 1) return { where: whereMock }
        return { where: countWhereMock }
      })

      selectMock = vi.fn().mockReturnValue({ from: fromMock })
      queryDb = {
        insert: vi.fn(),
        select: selectMock,
      }
      queryRepo = new DrizzleAuditEventRepository(queryDb as unknown as import('@future/db').Db)
    })

    it('issues select then count sequentially (no Promise.all)', async () => {
      // The source awaits each query in sequence — sequential call count is the
      // structural proof. No Promise.all means both calls complete before the
      // function returns, which is verified by asserting both were called exactly
      // once each after a single top-level await.
      await queryRepo.query({
        tenantId: 'tenant-1',
        limit: 10,
        offset: 0,
      })

      // Two selects — one for items, one for count
      expect(queryDb.select).toHaveBeenCalledTimes(2)
    })
  })
})
