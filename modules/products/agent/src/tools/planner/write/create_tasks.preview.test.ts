import { tenantContext } from '@seta/tenant'
import { describe, expect, it, vi } from 'vitest'
import { createTasksPreviewTool } from './create_tasks.preview'

const makeCtx = () => ({
  surface: 'direct' as const,
  abortSignal: new AbortController().signal,
  runId: 'r',
  requestContext: {} as never,
})

const makePlan = () => ({
  data: { id: 'P1', title: 'My Plan' },
  source: 'cache:fresh',
  ageSeconds: 0,
})

function makeDeps(
  overrides: Partial<{
    requireConsent: ReturnType<typeof vi.fn>
    planOne: ReturnType<typeof vi.fn>
    mint: ReturnType<typeof vi.fn>
  }> = {},
) {
  const mocks = {
    planOne: overrides.planOne ?? vi.fn().mockResolvedValue(makePlan()),
    mint:
      overrides.mint ?? vi.fn().mockResolvedValue({ token: 'tok-create', expiresAt: new Date() }),
  }
  const deps = {
    registry: {
      requireConsent: overrides.requireConsent ?? vi.fn().mockResolvedValue(undefined),
    },
    tokenForUser: vi.fn().mockResolvedValue({ accessToken: 'at' }),
    buildClient: vi.fn().mockReturnValue({}),
    buildCache: vi.fn().mockReturnValue({
      plan: { one: mocks.planOne },
    }),
    continuationStore: { mint: mocks.mint },
    ttlMinutes: 15,
  }
  return { deps, mocks }
}

describe('planner.create_tasks.preview', () => {
  it('happy path: 2 tasks in same plan → plan.one called once, mint with empty etagSnapshot, card is AdaptiveCard', async () => {
    const { deps, mocks } = makeDeps()
    const tool = createTasksPreviewTool(deps as never)

    const result = await tenantContext.run({ tenantId: 'tenant1', userId: 'user1' }, () =>
      tool.execute(
        {
          tasks: [
            { planId: 'P1', title: 'Task A' },
            { planId: 'P1', title: 'Task B' },
          ],
        },
        makeCtx(),
      ),
    )

    expect('ok' in result && result.ok).toBe(true)
    if ('ok' in result && result.ok) {
      expect(result.value.token).toBe('tok-create')
      expect(result.value.ttlMinutes).toBe(15)
      expect(result.value.card['type']).toBe('AdaptiveCard')
    }

    expect(mocks.planOne).toHaveBeenCalledOnce()
    expect(mocks.planOne).toHaveBeenCalledWith('P1')

    expect(mocks.mint).toHaveBeenCalledOnce()
    const mintCall = mocks.mint.mock.calls[0]?.[0] as Record<string, unknown>
    expect(mintCall['etagSnapshot']).toEqual({})
    expect(mintCall['tenantId']).toBe('tenant1')
    expect(mintCall['userId']).toBe('user1')
    expect(mintCall['toolId']).toBe('planner.create_tasks')
  })

  it('aborts when plan not found in cache', async () => {
    const planOne = vi.fn().mockResolvedValue(null)
    const mint = vi.fn()
    const { deps } = makeDeps({ planOne, mint })
    const tool = createTasksPreviewTool(deps as never)

    const result = await tenantContext.run({ tenantId: 't', userId: 'u' }, () =>
      tool.execute({ tasks: [{ planId: 'MISSING', title: 'Task' }] }, makeCtx()),
    )

    expect('ok' in result && result.ok).toBe(false)
    expect(mint).not.toHaveBeenCalled()
    if ('ok' in result && !result.ok) {
      expect(result.error.name).toBe('NotFound')
      expect(result.error.message).toContain('MISSING')
    }
  })

  it('aborts when consent check rejects', async () => {
    const requireConsent = vi.fn().mockRejectedValue(new Error('not consented'))
    const { deps } = makeDeps({ requireConsent })
    const tool = createTasksPreviewTool(deps as never)

    const result = await tenantContext.run({ tenantId: 't', userId: 'u' }, () =>
      tool.execute({ tasks: [{ planId: 'P1', title: 'Task' }] }, makeCtx()),
    )

    expect('ok' in result && result.ok).toBe(false)
    if ('ok' in result && !result.ok) {
      expect(result.error.message).toBe('not consented')
    }
  })
})
