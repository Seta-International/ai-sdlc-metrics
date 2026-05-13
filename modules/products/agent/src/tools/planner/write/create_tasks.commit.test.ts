import { describe, expect, it, vi } from 'vitest'
import { ContinuationConsumed } from '../_errors'
import { createTasksCommitTool } from './create_tasks.commit'

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
      payload: { tasks: [] },
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

describe('planner.create_tasks.commit', () => {
  it('idempotent replay: ContinuationConsumed with cached card → returns cached result without calling batch', async () => {
    const cachedCard = {
      type: 'AdaptiveCard',
      body: [{ type: 'TextBlock', text: 'All tasks created' }],
    }
    const verify = vi.fn().mockRejectedValue(new ContinuationConsumed(cachedCard))
    const { deps, mocks } = makeDeps({ verify })
    const tool = createTasksCommitTool(deps as never)

    const result = await tool.execute({ token: 'tok-consumed' }, makeCtx())

    expect('ok' in result && result.ok).toBe(true)
    if ('ok' in result && result.ok) {
      expect(result.value.card).toEqual(cachedCard)
      expect(result.value.results).toEqual([])
      expect(result.value.summary).toEqual({ succeeded: 0, failed: 0 })
    }
    expect(mocks.batchFn).not.toHaveBeenCalled()
  })

  it('happy path: 2 tasks in payload, batch returns 2×201 → summary succeeded:2, upsert called twice, markConsumed called', async () => {
    const task1 = { planId: 'P1', title: 'Task A' }
    const task2 = { planId: 'P1', title: 'Task B', bucketId: 'B1' }
    const verify = vi.fn().mockResolvedValue({
      payload: { tasks: [task1, task2] },
      etagSnapshot: {},
    })
    const batchFn = vi.fn().mockResolvedValue([
      { id: 'TN1', status: 201, etag: 'W/"e1"', body: { id: 'TN1', title: 'Task A' } },
      { id: 'TN2', status: 201, etag: 'W/"e2"', body: { id: 'TN2', title: 'Task B' } },
    ])
    const upsert = vi.fn().mockResolvedValue(undefined)
    const markConsumed = vi.fn().mockResolvedValue(undefined)

    const { deps, mocks } = makeDeps({ verify, batchFn, upsert, markConsumed })
    const tool = createTasksCommitTool(deps as never)

    const result = await tool.execute({ token: 'tok-valid' }, makeCtx())

    expect('ok' in result && result.ok).toBe(true)
    if ('ok' in result && result.ok) {
      expect(result.value.summary).toEqual({ succeeded: 2, failed: 0 })
      expect(result.value.results).toHaveLength(2)
      expect(result.value.results.every((r) => r.status === 'ok')).toBe(true)
    }
    expect(mocks.upsert).toHaveBeenCalledTimes(2)
    expect(mocks.upsert).toHaveBeenCalledWith('TN1', 'W/"e1"', expect.anything())
    expect(mocks.upsert).toHaveBeenCalledWith('TN2', 'W/"e2"', expect.anything())
    expect(mocks.markConsumed).toHaveBeenCalledOnce()
    expect(mocks.markConsumed).toHaveBeenCalledWith('tok-valid', expect.any(Object))
  })

  it('partial failure: 1 ok + 1 forbidden → summary succeeded:1, failed:1', async () => {
    const task1 = { planId: 'P1', title: 'Task A' }
    const task2 = { planId: 'P1', title: 'Task B' }
    const verify = vi.fn().mockResolvedValue({
      payload: { tasks: [task1, task2] },
      etagSnapshot: {},
    })
    const batchFn = vi.fn().mockResolvedValue([
      { id: 'TN1', status: 201, etag: 'W/"e1"', body: { id: 'TN1', title: 'Task A' } },
      { id: 'TN2', status: 403, etag: null },
    ])
    const upsert = vi.fn().mockResolvedValue(undefined)

    const { deps, mocks } = makeDeps({ verify, batchFn, upsert })
    const tool = createTasksCommitTool(deps as never)

    const result = await tool.execute({ token: 'tok-partial' }, makeCtx())

    expect('ok' in result && result.ok).toBe(true)
    if ('ok' in result && result.ok) {
      expect(result.value.summary).toEqual({ succeeded: 1, failed: 1 })
      const tn2Result = result.value.results.find((r) => r.taskId === 'TN2')
      expect(tn2Result?.status).toBe('forbidden')
    }
    expect(mocks.upsert).toHaveBeenCalledOnce()
  })
})
