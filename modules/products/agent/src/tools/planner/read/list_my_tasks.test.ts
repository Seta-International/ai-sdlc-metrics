import { tenantContext } from '@seta/tenant'
import { describe, expect, it, vi } from 'vitest'
import { listMyTasksTool } from './list_my_tasks'

describe('planner.list_my_tasks', () => {
  it('calls client.listMyTasks and returns items with source=live', async () => {
    const deps = {
      registry: { requireConsent: vi.fn().mockResolvedValue(undefined) },
      tokenForUser: vi.fn().mockResolvedValue({ accessToken: 'tk' }),
      buildClient: vi.fn().mockReturnValue({
        listMyTasks: async function* () {
          yield { id: 'T1' }
          yield { id: 'T2' }
        },
      }),
      buildCache: vi.fn(),
    }
    const tool = listMyTasksTool(deps as never)
    const result = await tenantContext.run({ tenantId: 't', userId: 'u' }, () =>
      tool.execute(
        {},
        {
          surface: 'direct',
          abortSignal: new AbortController().signal,
          runId: 'r1',
          requestContext: {} as never,
        },
      ),
    )
    expect('ok' in result && result.ok).toBe(true)
    if ('ok' in result && result.ok) {
      expect(result.value.items).toHaveLength(2)
      expect(result.value.source).toBe('live')
    }
  })

  it('aborts when consent missing', async () => {
    const deps = {
      registry: { requireConsent: vi.fn().mockRejectedValue(new Error('not consented')) },
      tokenForUser: vi.fn(),
      buildClient: vi.fn(),
      buildCache: vi.fn(),
    }
    const tool = listMyTasksTool(deps as never)
    const result = await tenantContext.run({ tenantId: 't', userId: 'u' }, () =>
      tool.execute(
        {},
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
