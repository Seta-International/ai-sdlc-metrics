import { tenantContext } from '@seta/tenant'
import { describe, expect, it, vi } from 'vitest'
import { getTaskTool } from './get_task'

describe('planner.get_task', () => {
  it('returns task from cache with source annotation', async () => {
    const deps = {
      registry: { requireConsent: vi.fn().mockResolvedValue(undefined) },
      tokenForUser: vi.fn().mockResolvedValue({ accessToken: 'tk' }),
      buildClient: vi.fn().mockReturnValue({}),
      buildCache: vi.fn().mockReturnValue({
        task: {
          one: vi
            .fn()
            .mockResolvedValue({ data: { id: 'T1' }, source: 'cache:fresh', ageSeconds: 5 }),
        },
        taskDetails: {
          one: vi.fn().mockResolvedValue({
            data: { description: 'desc' },
            source: 'cache:fresh',
            ageSeconds: 5,
          }),
        },
      }),
    }
    const tool = getTaskTool(deps as never)
    const result = await tenantContext.run({ tenantId: 't', userId: 'u' }, () =>
      tool.execute(
        { taskId: 'T1' },
        {
          surface: 'direct',
          abortSignal: new AbortController().signal,
          runId: 'r',
          requestContext: {} as never,
        },
      ),
    )
    expect('ok' in result && result.ok).toBe(true)
    if ('ok' in result && result.ok) {
      expect(result.value.source).toBe('cache:fresh')
      expect(result.value.ageSeconds).toBe(5)
    }
  })

  it('returns not found when cache miss and live also misses', async () => {
    const deps = {
      registry: { requireConsent: vi.fn().mockResolvedValue(undefined) },
      tokenForUser: vi.fn().mockResolvedValue({ accessToken: 'tk' }),
      buildClient: vi.fn().mockReturnValue({}),
      buildCache: vi.fn().mockReturnValue({
        task: { one: vi.fn().mockResolvedValue(null) },
        taskDetails: { one: vi.fn().mockResolvedValue(null) },
      }),
    }
    const tool = getTaskTool(deps as never)
    const result = await tenantContext.run({ tenantId: 't', userId: 'u' }, () =>
      tool.execute(
        { taskId: 'T999' },
        {
          surface: 'direct',
          abortSignal: new AbortController().signal,
          runId: 'r',
          requestContext: {} as never,
        },
      ),
    )
    expect('ok' in result && result.ok).toBe(false)
  })
})
