import { tenantContext } from '@seta/tenant'
import { describe, expect, it, vi } from 'vitest'
import { createPlanPreviewTool } from './create_plan.preview'

const makeCtx = () => ({
  surface: 'direct' as const,
  abortSignal: new AbortController().signal,
  runId: 'r',
  requestContext: {} as never,
})

function makeDeps(
  overrides: Partial<{
    requireConsent: ReturnType<typeof vi.fn>
    mint: ReturnType<typeof vi.fn>
  }> = {},
) {
  const mocks = {
    mint: overrides.mint ?? vi.fn().mockResolvedValue({ token: 'tok-plan', expiresAt: new Date() }),
  }
  const deps = {
    registry: {
      requireConsent: overrides.requireConsent ?? vi.fn().mockResolvedValue(undefined),
    },
    continuationStore: { mint: mocks.mint },
    ttlMinutes: 15,
  }
  return { deps, mocks }
}

describe('planner.create_plan.preview', () => {
  it('happy path: mint called with correct payload, card is AdaptiveCard with right title/verb', async () => {
    const { deps, mocks } = makeDeps()
    const tool = createPlanPreviewTool(deps as never)

    const result = await tenantContext.run({ tenantId: 'tenant1', userId: 'user1' }, () =>
      tool.execute({ ownerGroupId: 'group-abc', title: 'My New Plan' }, makeCtx()),
    )

    expect('ok' in result && result.ok).toBe(true)
    if ('ok' in result && result.ok) {
      expect(result.value.token).toBe('tok-plan')
      expect(result.value.ttlMinutes).toBe(15)
      expect(result.value.card.type).toBe('AdaptiveCard')

      const actions = result.value.card.actions as Array<{ verb: string; title: string }>
      const confirmAction = actions.find((a) => a.title === 'Confirm')
      expect(confirmAction?.verb).toBe('planner.create_plan.commit')
    }

    expect(mocks.mint).toHaveBeenCalledOnce()
    const mintCall = mocks.mint.mock.calls[0]?.[0] as Record<string, unknown>
    expect(mintCall.etagSnapshot).toEqual({})
    expect(mintCall.tenantId).toBe('tenant1')
    expect(mintCall.userId).toBe('user1')
    expect(mintCall.toolId).toBe('planner.create_plan')
    expect(mintCall.payload).toEqual({ ownerGroupId: 'group-abc', title: 'My New Plan' })
  })

  it('aborts when consent check rejects', async () => {
    const requireConsent = vi.fn().mockRejectedValue(new Error('not consented'))
    const { deps } = makeDeps({ requireConsent })
    const tool = createPlanPreviewTool(deps as never)

    const result = await tenantContext.run({ tenantId: 't', userId: 'u' }, () =>
      tool.execute({ ownerGroupId: 'g1', title: 'Plan' }, makeCtx()),
    )

    expect('ok' in result && result.ok).toBe(false)
    if ('ok' in result && !result.ok) {
      expect(result.error.message).toBe('not consented')
    }
  })
})
