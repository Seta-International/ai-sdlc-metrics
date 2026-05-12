import { tenantContext } from '@seta/tenant'
import { describe, expect, it, vi } from 'vitest'
import { updateTasksPreviewTool } from './update_tasks.preview'

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
  const taskOne = overrides.taskOne ?? vi.fn().mockResolvedValue(makeTask())
  const etagGet = overrides.etagGet ?? vi.fn().mockResolvedValue('W/"etag1"')
  const mint =
    overrides.mint ?? vi.fn().mockResolvedValue({ token: 'tok-abc', expiresAt: new Date() })

  return {
    registry: {
      requireConsent: overrides.requireConsent ?? vi.fn().mockResolvedValue(undefined),
    },
    tokenForUser: vi.fn().mockResolvedValue({ accessToken: 'at' }),
    buildClient: vi.fn().mockReturnValue({}),
    buildCache: vi.fn().mockReturnValue({
      task: { one: taskOne },
    }),
    etagStore: { get: etagGet },
    continuationStore: { mint },
    ttlMinutes: 15,
    _taskOne: taskOne,
    _etagGet: etagGet,
    _mint: mint,
  }
}

describe('planner.update_tasks.preview', () => {
  it('happy path: returns ok with card and token, mint called with etagSnapshot', async () => {
    const deps = makeDeps()
    const tool = updateTasksPreviewTool(deps as never)

    const result = await tenantContext.run({ tenantId: 'tenant1', userId: 'user1' }, () =>
      tool.execute({ updates: [{ taskId: 'T1', title: 'New title' }] }, makeCtx()),
    )

    expect('ok' in result && result.ok).toBe(true)
    if (!('ok' in result) || !result.ok) return

    expect(result.value.token).toBe('tok-abc')
    expect(result.value.ttlMinutes).toBe(15)
    expect(result.value.card['type']).toBe('AdaptiveCard')

    expect(deps._mint).toHaveBeenCalledOnce()
    const mintCall = deps._mint.mock.calls[0]?.[0] as Record<string, unknown>
    expect(mintCall['etagSnapshot']).toEqual({ T1: 'W/"etag1"' })
    expect(mintCall['tenantId']).toBe('tenant1')
    expect(mintCall['userId']).toBe('user1')
    expect(mintCall['toolId']).toBe('planner.update_tasks')
  })

  it('aborts when task not found in cache', async () => {
    const taskOne = vi.fn().mockResolvedValue(null)
    const mint = vi.fn()
    const deps = makeDeps({ taskOne, mint })
    const tool = updateTasksPreviewTool(deps as never)

    const result = await tenantContext.run({ tenantId: 't', userId: 'u' }, () =>
      tool.execute({ updates: [{ taskId: 'MISSING' }] }, makeCtx()),
    )

    expect('ok' in result && result.ok).toBe(false)
    expect(mint).not.toHaveBeenCalled()
    if ('ok' in result && !result.ok) {
      expect(result.error.name).toBe('NotFound')
    }
  })

  it('aborts when etag missing from etagStore', async () => {
    const etagGet = vi.fn().mockResolvedValue(null)
    const mint = vi.fn()
    const deps = makeDeps({ etagGet, mint })
    const tool = updateTasksPreviewTool(deps as never)

    const result = await tenantContext.run({ tenantId: 't', userId: 'u' }, () =>
      tool.execute({ updates: [{ taskId: 'T1' }] }, makeCtx()),
    )

    expect('ok' in result && result.ok).toBe(false)
    expect(mint).not.toHaveBeenCalled()
    if ('ok' in result && !result.ok) {
      expect(result.error.name).toBe('MissingEtag')
    }
  })

  it('aborts when consent check rejects', async () => {
    const requireConsent = vi.fn().mockRejectedValue(new Error('not consented'))
    const deps = makeDeps({ requireConsent })
    const tool = updateTasksPreviewTool(deps as never)

    const result = await tenantContext.run({ tenantId: 't', userId: 'u' }, () =>
      tool.execute({ updates: [{ taskId: 'T1' }] }, makeCtx()),
    )

    expect('ok' in result && result.ok).toBe(false)
    if ('ok' in result && !result.ok) {
      expect(result.error.message).toBe('not consented')
    }
  })
})
