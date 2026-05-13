import { describe, expect, it, vi } from 'vitest'
import { ContinuationConsumed } from '../_errors'
import { completeTasksCommitTool } from './complete_tasks.commit'

vi.mock('@seta/tenant', () => ({
  tenantContext: { getTenantId: () => 't', getUserId: () => 'u' },
}))

const makeCtx = () => ({
  surface: 'direct' as const,
  abortSignal: new AbortController().signal,
  runId: 'r',
  requestContext: {} as never,
})

function makeDeps(
  overrides: {
    verify?: ReturnType<typeof vi.fn>
    markConsumed?: ReturnType<typeof vi.fn>
    batchFn?: ReturnType<typeof vi.fn>
    upsert?: ReturnType<typeof vi.fn>
    softDelete?: ReturnType<typeof vi.fn>
  } = {},
) {
  const upsert = overrides.upsert ?? vi.fn().mockResolvedValue(undefined)
  const softDelete = overrides.softDelete ?? vi.fn().mockResolvedValue(undefined)
  const batchFn = overrides.batchFn ?? vi.fn().mockResolvedValue([])
  const markConsumed = overrides.markConsumed ?? vi.fn().mockResolvedValue(undefined)
  const verify =
    overrides.verify ??
    vi.fn().mockResolvedValue({
      payload: { taskIds: [] },
      etagSnapshot: {},
    })

  return {
    deps: {
      registry: { requireConsent: vi.fn().mockResolvedValue(undefined) },
      tokenForUser: vi.fn().mockResolvedValue({ accessToken: 'at' }),
      buildGraph: vi.fn().mockReturnValue({ batch: batchFn }),
      buildCache: vi.fn().mockReturnValue({ task: { upsert, softDelete } }),
      continuationStore: { verify, markConsumed },
      batchConcurrency: 1,
    },
    mocks: { verify, markConsumed, batchFn, upsert, softDelete },
  }
}

describe('planner.complete_tasks.commit', () => {
  it('idempotent replay: ContinuationConsumed with cached card → returns cached result without calling batch', async () => {
    const cachedCard = {
      type: 'AdaptiveCard',
      body: [{ type: 'TextBlock', text: 'All tasks completed' }],
    }
    const verify = vi.fn().mockRejectedValue(new ContinuationConsumed(cachedCard))
    const { deps, mocks } = makeDeps({ verify })
    const tool = completeTasksCommitTool(deps as never)

    const result = await tool.execute({ token: 'tok-consumed' }, makeCtx())

    expect('ok' in result && result.ok).toBe(true)
    if ('ok' in result && result.ok) {
      expect(result.value.card).toEqual(cachedCard)
      expect(result.value.results).toEqual([])
      expect(result.value.summary).toEqual({ succeeded: 0, failed: 0 })
    }
    expect(mocks.batchFn).not.toHaveBeenCalled()
  })

  it('happy path: 2 taskIds, both return 200 → summary succeeded:2, upsert called twice, markConsumed called', async () => {
    const verify = vi.fn().mockResolvedValue({
      payload: { taskIds: ['T1', 'T2'] },
      etagSnapshot: { T1: 'W/"e1"', T2: 'W/"e2"' },
    })
    const batchFn = vi.fn().mockResolvedValue([
      { id: 'T1', status: 200, etag: 'W/"e1-new"', body: { id: 'T1', percentComplete: 100 } },
      { id: 'T2', status: 200, etag: 'W/"e2-new"', body: { id: 'T2', percentComplete: 100 } },
    ])
    const upsert = vi.fn().mockResolvedValue(undefined)
    const markConsumed = vi.fn().mockResolvedValue(undefined)

    const { deps, mocks } = makeDeps({ verify, batchFn, upsert, markConsumed })
    const tool = completeTasksCommitTool(deps as never)

    const result = await tool.execute({ token: 'tok-valid' }, makeCtx())

    expect('ok' in result && result.ok).toBe(true)
    if ('ok' in result && result.ok) {
      expect(result.value.summary).toEqual({ succeeded: 2, failed: 0 })
      expect(result.value.results).toHaveLength(2)
      expect(result.value.results.every((r) => r.status === 'ok')).toBe(true)
    }
    expect(mocks.upsert).toHaveBeenCalledTimes(2)
    expect(mocks.upsert).toHaveBeenCalledWith('T1', 'W/"e1-new"', expect.anything())
    expect(mocks.upsert).toHaveBeenCalledWith('T2', 'W/"e2-new"', expect.anything())
    expect(mocks.markConsumed).toHaveBeenCalledOnce()
    expect(mocks.markConsumed).toHaveBeenCalledWith('tok-valid', expect.any(Object))
  })

  it('ETag conflict: 1×200 + 1×412 → summary succeeded:1, failed:1, T2 status=conflict', async () => {
    const verify = vi.fn().mockResolvedValue({
      payload: { taskIds: ['T1', 'T2'] },
      etagSnapshot: { T1: 'W/"e1"', T2: 'W/"e2"' },
    })
    const batchFn = vi.fn().mockResolvedValue([
      { id: 'T1', status: 200, etag: 'W/"e1-new"', body: { id: 'T1', percentComplete: 100 } },
      { id: 'T2', status: 412, etag: null },
    ])
    const upsert = vi.fn().mockResolvedValue(undefined)

    const { deps, mocks } = makeDeps({ verify, batchFn, upsert })
    const tool = completeTasksCommitTool(deps as never)

    const result = await tool.execute({ token: 'tok-conflict' }, makeCtx())

    expect('ok' in result && result.ok).toBe(true)
    if ('ok' in result && result.ok) {
      expect(result.value.summary).toEqual({ succeeded: 1, failed: 1 })
      const t2Result = result.value.results.find((r) => r.taskId === 'T2')
      expect(t2Result?.status).toBe('conflict')
    }
    expect(mocks.upsert).toHaveBeenCalledOnce()
  })
})
