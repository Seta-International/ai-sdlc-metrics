import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CrossPodCancelService } from './cross-pod-cancel'

const TRACE_ID = 'trace-uuid-001'
const POD_ID_A = 'pod-a'
const POD_ID_B = 'pod-b'

function makeDbWithRows(rows: object[]) {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(rows),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  }
}

function makeRow(overrides: object = {}) {
  return {
    traceId: TRACE_ID,
    tenantId: 'tenant-uuid-001',
    userId: 'user-uuid-001',
    conversationId: null,
    podId: POD_ID_A,
    surface: 'global-chat',
    startedAt: new Date(),
    lastHeartbeatAt: new Date(),
    abortPending: false,
    ...overrides,
  }
}

describe('CrossPodCancelService', () => {
  let originalPodId: string | undefined
  let originalPodIpPrefix: string | undefined

  beforeEach(() => {
    originalPodId = process.env['POD_ID']
    originalPodIpPrefix = process.env['POD_IP_PREFIX']
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    if (originalPodId === undefined) {
      delete process.env['POD_ID']
    } else {
      process.env['POD_ID'] = originalPodId
    }
    if (originalPodIpPrefix === undefined) {
      delete process.env['POD_IP_PREFIX']
    } else {
      process.env['POD_IP_PREFIX'] = originalPodIpPrefix
    }
    vi.unstubAllGlobals()
  })

  it('returns not_found when no DB row exists for traceId', async () => {
    const db = makeDbWithRows([])
    const service = new CrossPodCancelService(db as never)

    const result = await service.forwardIfNeeded(TRACE_ID)

    expect(result).toEqual({ status: 'not_found' })
    expect(db.update).not.toHaveBeenCalled()
  })

  it('returns local when DB row pod_id matches current POD_ID', async () => {
    process.env['POD_ID'] = POD_ID_A
    const db = makeDbWithRows([makeRow({ podId: POD_ID_A })])
    const service = new CrossPodCancelService(db as never)

    const result = await service.forwardIfNeeded(TRACE_ID)

    expect(result).toEqual({ status: 'local' })
    expect(global.fetch).not.toHaveBeenCalled()
    expect(db.update).not.toHaveBeenCalled()
  })

  it('returns forwarded when HTTP call to owning pod succeeds', async () => {
    process.env['POD_ID'] = POD_ID_B
    delete process.env['POD_IP_PREFIX']
    const db = makeDbWithRows([makeRow({ podId: POD_ID_A })])
    const service = new CrossPodCancelService(db as never)

    vi.mocked(global.fetch).mockResolvedValue({ ok: true } as Response)

    const result = await service.forwardIfNeeded(TRACE_ID)

    expect(result).toEqual({ status: 'forwarded' })
    expect(global.fetch).toHaveBeenCalledWith(
      `http://${POD_ID_A}/api/agent/turn/${TRACE_ID}/cancel`,
      expect.objectContaining({ method: 'POST' }),
    )
    expect(db.update).not.toHaveBeenCalled()
  })

  it('returns eventual and sets abort_pending when forwarded HTTP call fails with network error', async () => {
    process.env['POD_ID'] = POD_ID_B
    delete process.env['POD_IP_PREFIX']
    const db = makeDbWithRows([makeRow({ podId: POD_ID_A })])
    const updateWhere = vi.fn().mockResolvedValue(undefined)
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere })
    db.update = vi.fn().mockReturnValue({ set: updateSet })
    const service = new CrossPodCancelService(db as never)

    vi.mocked(global.fetch).mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await service.forwardIfNeeded(TRACE_ID)

    expect(result).toEqual({
      status: 'eventual',
      message: 'Cancel forwarded asynchronously via abort_pending flag',
    })
    expect(db.update).toHaveBeenCalled()
    expect(updateSet).toHaveBeenCalledWith({ abortPending: true })
  })

  it('returns eventual and sets abort_pending when forwarded HTTP returns non-2xx', async () => {
    process.env['POD_ID'] = POD_ID_B
    delete process.env['POD_IP_PREFIX']
    const db = makeDbWithRows([makeRow({ podId: POD_ID_A })])
    const updateWhere = vi.fn().mockResolvedValue(undefined)
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere })
    db.update = vi.fn().mockReturnValue({ set: updateSet })
    const service = new CrossPodCancelService(db as never)

    vi.mocked(global.fetch).mockResolvedValue({ ok: false, status: 503 } as Response)

    const result = await service.forwardIfNeeded(TRACE_ID)

    expect(result).toEqual({
      status: 'eventual',
      message: 'Cancel forwarded asynchronously via abort_pending flag',
    })
    expect(db.update).toHaveBeenCalled()
    expect(updateSet).toHaveBeenCalledWith({ abortPending: true })
  })

  it('POD_ID defaults to local when env var not set', async () => {
    delete process.env['POD_ID']
    // Row with podId = 'local' matches default
    const db = makeDbWithRows([makeRow({ podId: 'local' })])
    const service = new CrossPodCancelService(db as never)

    const result = await service.forwardIfNeeded(TRACE_ID)

    expect(result).toEqual({ status: 'local' })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('POD_IP_PREFIX env var is used to construct the pod host URL', async () => {
    process.env['POD_ID'] = POD_ID_B
    process.env['POD_IP_PREFIX'] = '10.0.1'
    const db = makeDbWithRows([makeRow({ podId: '42' })])
    const service = new CrossPodCancelService(db as never)

    vi.mocked(global.fetch).mockResolvedValue({ ok: true } as Response)

    const result = await service.forwardIfNeeded(TRACE_ID)

    expect(result).toEqual({ status: 'forwarded' })
    expect(global.fetch).toHaveBeenCalledWith(
      `http://10.0.1.42/api/agent/turn/${TRACE_ID}/cancel`,
      expect.objectContaining({ method: 'POST' }),
    )
  })
})
