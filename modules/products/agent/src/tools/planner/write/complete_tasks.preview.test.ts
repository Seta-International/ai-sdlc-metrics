import { tenantContext } from '@seta/tenant'
import { describe, expect, it, vi } from 'vitest'
import { completeTasksPreviewTool } from './complete_tasks.preview'

const makeCtx = () => ({
  surface: 'direct' as const,
  abortSignal: new AbortController().signal,
  runId: 'r',
  requestContext: {} as never,
})

const makeTask = () => ({
  data: { id: 'T1', title: 'Do thing' },
  source: 'cache:fresh',
  ageSeconds: 0,
})

function makeDeps(
  overrides: Partial<{
    requireConsent: ReturnType<typeof vi.fn>
    taskOne: ReturnType<typeof vi.fn>
    etagGet: ReturnType<typeof vi.fn>
    mint: ReturnType<typeof vi.fn>
  }> = {},
) {
  const mocks = {
    taskOne: overrides.taskOne ?? vi.fn().mockResolvedValue(makeTask()),
    etagGet: overrides.etagGet ?? vi.fn().mockResolvedValue('W/"etag1"'),
    mint:
      overrides.mint ?? vi.fn().mockResolvedValue({ token: 'tok-complete', expiresAt: new Date() }),
  }
  const deps = {
    registry: {
      requireConsent: overrides.requireConsent ?? vi.fn().mockResolvedValue(undefined),
    },
    tokenForUser: vi.fn().mockResolvedValue({ accessToken: 'at' }),
    buildClient: vi.fn().mockReturnValue({}),
    buildCache: vi.fn().mockReturnValue({
      task: { one: mocks.taskOne },
    }),
    etagStore: { get: mocks.etagGet },
    continuationStore: { mint: mocks.mint },
    ttlMinutes: 15,
  }
  return { deps, mocks }
}

describe('planner.complete_tasks.preview', () => {
  it('happy path: 2 taskIds → task.one called twice, etag fetched twice, mint with correct etagSnapshot', async () => {
    const taskOne = vi
      .fn()
      .mockResolvedValueOnce({
        data: { id: 'T1', title: 'Task 1' },
        source: 'cache:fresh',
        ageSeconds: 0,
      })
      .mockResolvedValueOnce({
        data: { id: 'T2', title: 'Task 2' },
        source: 'cache:fresh',
        ageSeconds: 0,
      })
    const etagGet = vi
      .fn()
      .mockResolvedValueOnce('W/"etag-t1"')
      .mockResolvedValueOnce('W/"etag-t2"')
    const mint = vi.fn().mockResolvedValue({ token: 'tok-complete', expiresAt: new Date() })
    const { deps } = makeDeps({ taskOne, etagGet, mint })
    const tool = completeTasksPreviewTool(deps as never)

    const result = await tenantContext.run({ tenantId: 'tenant1', userId: 'user1' }, () =>
      tool.execute({ taskIds: ['T1', 'T2'] }, makeCtx()),
    )

    expect('ok' in result && result.ok).toBe(true)
    if ('ok' in result && result.ok) {
      expect(result.value.token).toBe('tok-complete')
      expect(result.value.ttlMinutes).toBe(15)
      expect(result.value.card.type).toBe('AdaptiveCard')
    }

    expect(taskOne).toHaveBeenCalledTimes(2)
    expect(etagGet).toHaveBeenCalledTimes(2)

    expect(mint).toHaveBeenCalledOnce()
    const mintCall = mint.mock.calls[0]?.[0] as Record<string, unknown>
    expect(mintCall.etagSnapshot).toEqual({ T1: 'W/"etag-t1"', T2: 'W/"etag-t2"' })
    expect(mintCall.tenantId).toBe('tenant1')
    expect(mintCall.userId).toBe('user1')
    expect(mintCall.toolId).toBe('planner.complete_tasks')
  })

  it('aborts when task not found in cache', async () => {
    const taskOne = vi.fn().mockResolvedValue(null)
    const mint = vi.fn()
    const { deps } = makeDeps({ taskOne, mint })
    const tool = completeTasksPreviewTool(deps as never)

    const result = await tenantContext.run({ tenantId: 't', userId: 'u' }, () =>
      tool.execute({ taskIds: ['MISSING'] }, makeCtx()),
    )

    expect('ok' in result && result.ok).toBe(false)
    expect(mint).not.toHaveBeenCalled()
    if ('ok' in result && !result.ok) {
      expect(result.error.name).toBe('NotFound')
      expect(result.error.message).toContain('MISSING')
    }
  })

  it('aborts when ETag missing from etagStore', async () => {
    const etagGet = vi.fn().mockResolvedValue(null)
    const mint = vi.fn()
    const { deps } = makeDeps({ etagGet, mint })
    const tool = completeTasksPreviewTool(deps as never)

    const result = await tenantContext.run({ tenantId: 't', userId: 'u' }, () =>
      tool.execute({ taskIds: ['T1'] }, makeCtx()),
    )

    expect('ok' in result && result.ok).toBe(false)
    expect(mint).not.toHaveBeenCalled()
    if ('ok' in result && !result.ok) {
      expect(result.error.name).toBe('MissingEtag')
    }
  })
})
