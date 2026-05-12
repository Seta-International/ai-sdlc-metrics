import { tenantContext } from '@seta/tenant'
import { describe, expect, it, vi } from 'vitest'
import { listPlansTool } from './list_plans'

describe('planner.list_plans', () => {
  it('calls client.listMyPlans and returns items with source=live', async () => {
    const deps = {
      registry: { requireConsent: vi.fn().mockResolvedValue(undefined) },
      tokenForUser: vi.fn().mockResolvedValue({ accessToken: 'tk' }),
      buildClient: vi.fn().mockReturnValue({
        listMyPlans: async function* () {
          yield { id: 'P1' }
          yield { id: 'P2' }
        },
      }),
      buildCache: vi.fn(),
    }
    const tool = listPlansTool(deps as never)
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
    expect('ok' in result && result.ok).toBe(true)
    if ('ok' in result && result.ok) {
      expect(result.value.items).toHaveLength(2)
      expect(result.value.source).toBe('live')
    }
  })

  it('fails when consent missing', async () => {
    const deps = {
      registry: { requireConsent: vi.fn().mockRejectedValue(new Error('no consent')) },
      tokenForUser: vi.fn(),
      buildClient: vi.fn(),
      buildCache: vi.fn(),
    }
    const tool = listPlansTool(deps as never)
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
