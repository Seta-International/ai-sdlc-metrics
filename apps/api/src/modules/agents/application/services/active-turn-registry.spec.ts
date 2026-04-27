import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ActiveTurnRegistry } from './active-turn-registry'
import { ZERO_USAGE } from './abort-coordinator'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TRACE_ID = '01900000-0000-7000-8000-000000000001'
const TENANT_ID = '01900000-0000-7000-8000-000000000002'
const USER_ID = '01900000-0000-7000-8000-000000000003'
const CONV_ID = '01900000-0000-7000-8000-000000000004'

// ─── Mock factory ─────────────────────────────────────────────────────────────

function buildDbMock(opts: { abortPending?: boolean } = {}) {
  const whereMockDelete = vi.fn().mockResolvedValue(undefined)
  const returningMock = vi.fn().mockResolvedValue([{ abortPending: opts.abortPending ?? false }])
  const whereMockUpdate = vi.fn().mockReturnValue({ returning: returningMock })
  const setMock = vi.fn().mockReturnValue({ where: whereMockUpdate })
  const valuesMock = vi.fn().mockResolvedValue(undefined)
  const insertIntoMock = vi.fn().mockReturnValue({ values: valuesMock })
  const updateMock = vi.fn().mockReturnValue({ set: setMock })
  const deleteMock = vi.fn().mockReturnValue({ where: whereMockDelete })

  const db = {
    insert: insertIntoMock,
    update: updateMock,
    delete: deleteMock,
  } as never

  return {
    db,
    valuesMock,
    whereMockDelete,
    whereMockUpdate,
    setMock,
    updateMock,
    deleteMock,
    returningMock,
  }
}

function buildControllers() {
  const userCancelController = new AbortController()
  const systemAbortController = new AbortController()
  const turnAbortSignal = AbortSignal.any([
    userCancelController.signal,
    systemAbortController.signal,
  ])
  return { userCancelController, systemAbortController, turnAbortSignal }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ActiveTurnRegistry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('1. register inserts a DB row and stores entry in the map', async () => {
    const { db, valuesMock } = buildDbMock()
    const registry = new ActiveTurnRegistry(db)
    const { userCancelController, systemAbortController, turnAbortSignal } = buildControllers()

    await registry.register({
      traceId: TRACE_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
      conversationId: CONV_ID,
      surface: 'web_chat',
      tier: 'full',
      userCancelController,
      systemAbortController,
      turnAbortSignal,
      usageAccumulator: { ...ZERO_USAGE },
    })

    expect(valuesMock).toHaveBeenCalledOnce()
    expect(registry.getEntry(TRACE_ID)).toBeDefined()
  })

  it('2. register starts a heartbeat timer that updates lastHeartbeatAt', async () => {
    const { db, setMock } = buildDbMock()
    const registry = new ActiveTurnRegistry(db)
    const { userCancelController, systemAbortController, turnAbortSignal } = buildControllers()

    await registry.register({
      traceId: TRACE_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
      conversationId: null,
      surface: 'web_chat',
      tier: 'full',
      userCancelController,
      systemAbortController,
      turnAbortSignal,
      usageAccumulator: { ...ZERO_USAGE },
    })

    expect(setMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(5_000)

    expect(setMock).toHaveBeenCalledOnce()
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ lastHeartbeatAt: expect.any(Date) }),
    )
  })

  it('3. unregister clears the timer, removes from map, deletes DB row', async () => {
    const { db, whereMockDelete } = buildDbMock()
    const registry = new ActiveTurnRegistry(db)
    const { userCancelController, systemAbortController, turnAbortSignal } = buildControllers()

    await registry.register({
      traceId: TRACE_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
      conversationId: CONV_ID,
      surface: 'web_chat',
      tier: 'full',
      userCancelController,
      systemAbortController,
      turnAbortSignal,
      usageAccumulator: { ...ZERO_USAGE },
    })

    await registry.unregister(TRACE_ID)

    expect(registry.getEntry(TRACE_ID)).toBeUndefined()
    expect(whereMockDelete).toHaveBeenCalledOnce()

    await vi.advanceTimersByTimeAsync(10_000)
    expect(whereMockDelete).toHaveBeenCalledOnce()
  })

  it('4. unregister is a no-op for unknown traceId', async () => {
    const { db, whereMockDelete } = buildDbMock()
    const registry = new ActiveTurnRegistry(db)

    await registry.unregister('unknown-trace-id')

    expect(whereMockDelete).not.toHaveBeenCalled()
  })

  it('5. getEntry returns entry for known traceId', async () => {
    const { db } = buildDbMock()
    const registry = new ActiveTurnRegistry(db)
    const { userCancelController, systemAbortController, turnAbortSignal } = buildControllers()
    const usageAccumulator = { ...ZERO_USAGE }

    await registry.register({
      traceId: TRACE_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
      conversationId: null,
      surface: 'web_chat',
      tier: 'full',
      userCancelController,
      systemAbortController,
      turnAbortSignal,
      usageAccumulator,
    })

    const entry = registry.getEntry(TRACE_ID)

    expect(entry).toBeDefined()
    expect(entry?.userCancelController).toBe(userCancelController)
    expect(entry?.systemAbortController).toBe(systemAbortController)
    expect(entry?.usageAccumulator).toBe(usageAccumulator)
  })

  it('6. getEntry returns undefined for unknown traceId', () => {
    const { db } = buildDbMock()
    const registry = new ActiveTurnRegistry(db)

    expect(registry.getEntry('no-such-trace')).toBeUndefined()
  })

  it('7. cancel aborts userCancelController and returns ok', async () => {
    const { db } = buildDbMock()
    const registry = new ActiveTurnRegistry(db)
    const { userCancelController, systemAbortController, turnAbortSignal } = buildControllers()

    await registry.register({
      traceId: TRACE_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
      conversationId: null,
      surface: 'web_chat',
      tier: 'full',
      userCancelController,
      systemAbortController,
      turnAbortSignal,
      usageAccumulator: { ...ZERO_USAGE },
    })

    const result = registry.cancel(TRACE_ID)

    expect(result).toBe('ok')
    expect(userCancelController.signal.aborted).toBe(true)
    expect(systemAbortController.signal.aborted).toBe(false)
  })

  it('8. cancel returns not_found for unknown traceId', () => {
    const { db } = buildDbMock()
    const registry = new ActiveTurnRegistry(db)

    expect(registry.cancel('no-such-trace')).toBe('not_found')
  })

  it('9. updateUsage patches the usageAccumulator', async () => {
    const { db } = buildDbMock()
    const registry = new ActiveTurnRegistry(db)
    const { userCancelController, systemAbortController, turnAbortSignal } = buildControllers()
    const usageAccumulator = { ...ZERO_USAGE }

    await registry.register({
      traceId: TRACE_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
      conversationId: null,
      surface: 'web_chat',
      tier: 'full',
      userCancelController,
      systemAbortController,
      turnAbortSignal,
      usageAccumulator,
    })

    registry.updateUsage(TRACE_ID, { input_tokens: 100, output_tokens: 50 })

    expect(registry.getEntry(TRACE_ID)?.usageAccumulator).toMatchObject({
      input_tokens: 100,
      output_tokens: 50,
      input_cached_read: 0,
      input_cached_write: 0,
      output_reasoning: 0,
    })
  })

  it('10. updateUsage is no-op for unknown traceId', () => {
    const { db } = buildDbMock()
    const registry = new ActiveTurnRegistry(db)

    expect(() => registry.updateUsage('no-such-trace', { input_tokens: 99 })).not.toThrow()
  })

  it('11. heartbeat aborts userCancelController when abort_pending=true comes back (cross-pod cancel detection, R-06.40)', async () => {
    const { db, returningMock } = buildDbMock({ abortPending: true })
    const registry = new ActiveTurnRegistry(db)
    const { userCancelController, systemAbortController, turnAbortSignal } = buildControllers()

    await registry.register({
      traceId: TRACE_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
      conversationId: null,
      surface: 'web_chat',
      tier: 'full',
      userCancelController,
      systemAbortController,
      turnAbortSignal,
      usageAccumulator: { ...ZERO_USAGE },
    })

    expect(userCancelController.signal.aborted).toBe(false)

    await vi.advanceTimersByTimeAsync(5_000)

    expect(returningMock).toHaveBeenCalledOnce()
    expect(userCancelController.signal.aborted).toBe(true)
    expect(systemAbortController.signal.aborted).toBe(false)
  })

  it('12. heartbeat does NOT abort when abort_pending=false', async () => {
    const { db } = buildDbMock({ abortPending: false })
    const registry = new ActiveTurnRegistry(db)
    const { userCancelController, systemAbortController, turnAbortSignal } = buildControllers()

    await registry.register({
      traceId: TRACE_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
      conversationId: null,
      surface: 'web_chat',
      tier: 'full',
      userCancelController,
      systemAbortController,
      turnAbortSignal,
      usageAccumulator: { ...ZERO_USAGE },
    })

    await vi.advanceTimersByTimeAsync(5_000)

    expect(userCancelController.signal.aborted).toBe(false)
    expect(systemAbortController.signal.aborted).toBe(false)
  })

  it('13. heartbeat is a no-op when entry has been unregistered between ticks (race safety)', async () => {
    const { db, returningMock } = buildDbMock({ abortPending: true })
    const registry = new ActiveTurnRegistry(db)
    const { userCancelController, systemAbortController, turnAbortSignal } = buildControllers()

    await registry.register({
      traceId: TRACE_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
      conversationId: null,
      surface: 'web_chat',
      tier: 'full',
      userCancelController,
      systemAbortController,
      turnAbortSignal,
      usageAccumulator: { ...ZERO_USAGE },
    })

    await registry.unregister(TRACE_ID)

    await vi.advanceTimersByTimeAsync(10_000)

    expect(returningMock).not.toHaveBeenCalled()
    expect(userCancelController.signal.aborted).toBe(false)
  })
})
