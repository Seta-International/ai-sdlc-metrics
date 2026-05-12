import { describe, expect, it, vi } from 'vitest'
import { ContinuationConsumed } from '../_errors'
import { addCommentsCommitTool } from './add_comments.commit'

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
  overrides: { verify?: ReturnType<typeof vi.fn>; markConsumed?: ReturnType<typeof vi.fn> } = {},
) {
  const markConsumed = overrides.markConsumed ?? vi.fn().mockResolvedValue(undefined)
  const verify =
    overrides.verify ??
    vi.fn().mockResolvedValue({
      payload: { taskId: 'T1', comment: 'Hello' },
      etagSnapshot: {},
    })

  return {
    deps: {
      registry: { requireConsent: vi.fn().mockResolvedValue(undefined) },
      continuationStore: { verify, markConsumed },
    },
    mocks: { verify, markConsumed },
  }
}

describe('planner.add_comments.commit', () => {
  it('idempotent replay: ContinuationConsumed with cached card → returns cached result', async () => {
    const cachedCard = {
      type: 'AdaptiveCard',
      body: [{ type: 'TextBlock', text: 'Comment posting not yet implemented' }],
    }
    const verify = vi.fn().mockRejectedValue(new ContinuationConsumed(cachedCard))
    const { deps, mocks } = makeDeps({ verify })
    const tool = addCommentsCommitTool(deps as never)

    const result = await tool.execute({ token: 'tok-consumed' }, makeCtx())

    expect('ok' in result && result.ok).toBe(true)
    if ('ok' in result && result.ok) {
      expect(result.value.card).toEqual(cachedCard)
      expect(result.value.results).toEqual([])
      expect(result.value.summary).toEqual({ succeeded: 0, failed: 0 })
    }
    expect(mocks.markConsumed).not.toHaveBeenCalled()
  })

  it('stub path: verify resolves → returns ok:true with "not implemented" card, markConsumed called', async () => {
    const { deps, mocks } = makeDeps()
    const tool = addCommentsCommitTool(deps as never)

    const result = await tool.execute({ token: 'tok-valid' }, makeCtx())

    expect('ok' in result && result.ok).toBe(true)
    if ('ok' in result && result.ok) {
      expect(result.value.card).toMatchObject({
        type: 'AdaptiveCard',
        body: expect.arrayContaining([
          expect.objectContaining({ text: 'Comment posting not yet implemented' }),
        ]),
      })
      expect(result.value.results).toEqual([])
      expect(result.value.summary).toEqual({ succeeded: 0, failed: 0 })
    }
    expect(mocks.markConsumed).toHaveBeenCalledOnce()
    expect(mocks.markConsumed).toHaveBeenCalledWith('tok-valid', expect.any(Object))
  })
})
