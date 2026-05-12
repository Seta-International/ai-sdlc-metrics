import { tenantContext } from '@seta/tenant'
import { describe, expect, it, vi } from 'vitest'
import { addCommentsPreviewTool } from './add_comments.preview'

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
    mint: ReturnType<typeof vi.fn>
  }> = {},
) {
  const mocks = {
    taskOne: overrides.taskOne ?? vi.fn().mockResolvedValue(makeTask()),
    mint:
      overrides.mint ?? vi.fn().mockResolvedValue({ token: 'tok-comments', expiresAt: new Date() }),
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
    continuationStore: { mint: mocks.mint },
    ttlMinutes: 15,
  }
  return { deps, mocks }
}

describe('planner.add_comments.preview', () => {
  it('happy path: 2 comments on different tasks → task.one called twice, mint with empty etagSnapshot', async () => {
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
    const mint = vi.fn().mockResolvedValue({ token: 'tok-comments', expiresAt: new Date() })
    const { deps } = makeDeps({ taskOne, mint })
    const tool = addCommentsPreviewTool(deps as never)

    const result = await tenantContext.run({ tenantId: 'tenant1', userId: 'user1' }, () =>
      tool.execute(
        {
          comments: [
            { taskId: 'T1', body: 'First comment' },
            { taskId: 'T2', body: 'Second comment' },
          ],
        },
        makeCtx(),
      ),
    )

    expect('ok' in result && result.ok).toBe(true)
    if ('ok' in result && result.ok) {
      expect(result.value.token).toBe('tok-comments')
      expect(result.value.ttlMinutes).toBe(15)
      expect(result.value.card.type).toBe('AdaptiveCard')
    }

    expect(taskOne).toHaveBeenCalledTimes(2)
    expect(taskOne).toHaveBeenCalledWith('T1')
    expect(taskOne).toHaveBeenCalledWith('T2')

    expect(mint).toHaveBeenCalledOnce()
    const mintCall = mint.mock.calls[0]?.[0] as Record<string, unknown>
    expect(mintCall.etagSnapshot).toEqual({})
    expect(mintCall.tenantId).toBe('tenant1')
    expect(mintCall.userId).toBe('user1')
    expect(mintCall.toolId).toBe('planner.add_comments')
  })

  it('aborts when task not found in cache', async () => {
    const taskOne = vi.fn().mockResolvedValue(null)
    const mint = vi.fn()
    const { deps } = makeDeps({ taskOne, mint })
    const tool = addCommentsPreviewTool(deps as never)

    const result = await tenantContext.run({ tenantId: 't', userId: 'u' }, () =>
      tool.execute({ comments: [{ taskId: 'MISSING', body: 'Hello' }] }, makeCtx()),
    )

    expect('ok' in result && result.ok).toBe(false)
    expect(mint).not.toHaveBeenCalled()
    if ('ok' in result && !result.ok) {
      expect(result.error.name).toBe('NotFound')
      expect(result.error.message).toContain('MISSING')
    }
  })
})
