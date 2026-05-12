import { describe, expect, it, vi } from 'vitest'
import { ContinuationConsumed } from '../_errors'
import { createPlanCommitTool } from './create_plan.commit'

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
    graphCall?: ReturnType<typeof vi.fn>
    planUpsert?: ReturnType<typeof vi.fn>
  } = {},
) {
  const planUpsert = overrides.planUpsert ?? vi.fn().mockResolvedValue(undefined)
  const markConsumed = overrides.markConsumed ?? vi.fn().mockResolvedValue(undefined)
  const graphCall =
    overrides.graphCall ??
    vi.fn().mockResolvedValue({ data: { id: 'P1' }, etag: 'W/"1"', status: 201 })
  const verify =
    overrides.verify ??
    vi.fn().mockResolvedValue({
      payload: { ownerGroupId: 'G1', title: 'My Plan' },
      etagSnapshot: {},
    })

  return {
    deps: {
      registry: { requireConsent: vi.fn().mockResolvedValue(undefined) },
      tokenForUser: vi.fn().mockResolvedValue({ accessToken: 'at' }),
      buildGraph: vi.fn().mockReturnValue({ call: graphCall }),
      buildCache: vi.fn().mockReturnValue({ plan: { upsert: planUpsert } }),
      continuationStore: { verify, markConsumed },
    },
    mocks: { verify, markConsumed, graphCall, planUpsert },
  }
}

describe('planner.create_plan.commit', () => {
  it('idempotent replay: ContinuationConsumed with cached card → returns cached result without calling graph', async () => {
    const cachedCard = {
      type: 'AdaptiveCard',
      body: [{ type: 'TextBlock', text: 'Plan created' }],
    }
    const verify = vi.fn().mockRejectedValue(new ContinuationConsumed(cachedCard))
    const { deps, mocks } = makeDeps({ verify })
    const tool = createPlanCommitTool(deps as never)

    const result = await tool.execute({ token: 'tok-consumed' }, makeCtx())

    expect('ok' in result && result.ok).toBe(true)
    if ('ok' in result && result.ok) {
      expect(result.value.card).toEqual(cachedCard)
      expect(result.value.results).toEqual([])
      expect(result.value.summary).toEqual({ succeeded: 0, failed: 0 })
    }
    expect(mocks.graphCall).not.toHaveBeenCalled()
  })

  it('happy path: graph.call returns {data:{id:"P1"}, etag:"W/\\"1\\""} → summary succeeded:1, cache.plan.upsert called, markConsumed called', async () => {
    const graphCall = vi
      .fn()
      .mockResolvedValue({ data: { id: 'P1', title: 'My Plan' }, etag: 'W/"1"', status: 201 })
    const planUpsert = vi.fn().mockResolvedValue(undefined)
    const markConsumed = vi.fn().mockResolvedValue(undefined)

    const { deps, mocks } = makeDeps({ graphCall, planUpsert, markConsumed })
    const tool = createPlanCommitTool(deps as never)

    const result = await tool.execute({ token: 'tok-valid' }, makeCtx())

    expect('ok' in result && result.ok).toBe(true)
    if ('ok' in result && result.ok) {
      expect(result.value.summary).toEqual({ succeeded: 1, failed: 0 })
      expect(result.value.results).toHaveLength(1)
      expect(result.value.results[0]).toMatchObject({ taskId: 'P1', status: 'ok' })
      expect(result.value.card).toMatchObject({
        type: 'AdaptiveCard',
        body: expect.arrayContaining([
          expect.objectContaining({ text: 'Plan created' }),
          expect.objectContaining({
            facts: expect.arrayContaining([
              expect.objectContaining({ title: 'Plan ID', value: 'P1' }),
            ]),
          }),
        ]),
      })
    }
    expect(mocks.planUpsert).toHaveBeenCalledOnce()
    expect(mocks.planUpsert).toHaveBeenCalledWith('P1', 'W/"1"', expect.anything())
    expect(mocks.markConsumed).toHaveBeenCalledOnce()
    expect(mocks.markConsumed).toHaveBeenCalledWith('tok-valid', expect.any(Object))
  })

  it('graph error (403): graph.call throws → returns ok:false', async () => {
    const graphCall = vi.fn().mockRejectedValue(new Error('GraphPermissionDenied'))
    const { deps, mocks } = makeDeps({ graphCall })
    const tool = createPlanCommitTool(deps as never)

    const result = await tool.execute({ token: 'tok-valid' }, makeCtx())

    expect('ok' in result && result.ok).toBe(false)
    if ('ok' in result && !result.ok) {
      expect(result.error.message).toBe('GraphPermissionDenied')
    }
    expect(mocks.planUpsert).not.toHaveBeenCalled()
    expect(mocks.markConsumed).not.toHaveBeenCalled()
  })
})
