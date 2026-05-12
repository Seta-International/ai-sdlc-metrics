import { describe, expect, it, vi } from 'vitest'
import { ContinuationConsumed } from '../_errors'
import { updateTasksCommitTool } from './update_tasks.commit'

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
      payload: { updates: [] },
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

describe('planner.update_tasks.commit', () => {
  it('idempotent replay: ContinuationConsumed with cached card → returns cached result without calling batch', async () => {
    const cachedCard = {
      type: 'AdaptiveCard',
      body: [{ type: 'TextBlock', text: 'All updates applied' }],
    }
    const verify = vi.fn().mockRejectedValue(new ContinuationConsumed(cachedCard))
    const { deps, mocks } = makeDeps({ verify })
    const tool = updateTasksCommitTool(deps as never)

    const result = await tool.execute({ token: 'tok-consumed' }, makeCtx())

    expect('ok' in result && result.ok).toBe(true)
    if ('ok' in result && result.ok) {
      expect(result.value.card).toEqual(cachedCard)
      expect(result.value.results).toEqual([])
      expect(result.value.summary).toEqual({ succeeded: 0, failed: 0 })
    }
    expect(mocks.batchFn).not.toHaveBeenCalled()
  })

  it('partial failure (1 ok + 1 conflict): upsert called once, markConsumed called, summary correct', async () => {
    const verify = vi.fn().mockResolvedValue({
      payload: {
        updates: [
          { taskId: 'T1', title: 'New title' },
          { taskId: 'T2', percentComplete: 50 },
        ],
      },
      etagSnapshot: { T1: 'W/"e1"', T2: 'W/"e2"' },
    })
    const batchFn = vi.fn().mockResolvedValue([
      { id: 'T1', status: 200, etag: 'W/"e1-new"', body: { id: 'T1', title: 'New title' } },
      { id: 'T2', status: 412, etag: null },
    ])
    const upsert = vi.fn().mockResolvedValue(undefined)
    const markConsumed = vi.fn().mockResolvedValue(undefined)

    const { deps, mocks } = makeDeps({ verify, batchFn, upsert, markConsumed })
    const tool = updateTasksCommitTool(deps as never)

    const result = await tool.execute({ token: 'tok-valid' }, makeCtx())

    expect('ok' in result && result.ok).toBe(true)
    if ('ok' in result && result.ok) {
      expect(result.value.summary).toEqual({ succeeded: 1, failed: 1 })
      const t2Result = result.value.results.find((r) => r.taskId === 'T2')
      expect(t2Result?.status).toBe('conflict')
    }

    // upsert called only for T1 (200 ok)
    expect(mocks.upsert).toHaveBeenCalledOnce()
    expect(mocks.upsert).toHaveBeenCalledWith('T1', 'W/"e1-new"', expect.anything())

    // markConsumed called with the token
    expect(mocks.markConsumed).toHaveBeenCalledOnce()
    expect(mocks.markConsumed).toHaveBeenCalledWith('tok-valid', expect.any(Object))
  })

  it('token invalid (bad HMAC): verify throws non-ContinuationConsumed → returns ok:false', async () => {
    const verify = vi.fn().mockRejectedValue(new Error('continuation signature invalid'))
    const { deps, mocks } = makeDeps({ verify })
    const tool = updateTasksCommitTool(deps as never)

    const result = await tool.execute({ token: 'tok-bad-hmac' }, makeCtx())

    expect('ok' in result && result.ok).toBe(false)
    if ('ok' in result && !result.ok) {
      expect(result.error.message).toBe('continuation signature invalid')
    }
    expect(mocks.batchFn).not.toHaveBeenCalled()
  })
})
