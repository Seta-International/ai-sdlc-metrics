import { tenantContext } from '@seta/tenant'
import { describe, expect, it, vi } from 'vitest'
import { listBucketsTool } from './list_buckets'

describe('planner.list_buckets', () => {
  it('lists buckets for a plan', async () => {
    const deps = {
      registry: { requireConsent: vi.fn().mockResolvedValue(undefined) },
      tokenForUser: vi.fn().mockResolvedValue({ accessToken: 'tk' }),
      buildClient: vi.fn().mockReturnValue({
        listBuckets: async function* () {
          yield { id: 'B1' }
          yield { id: 'B2' }
        },
      }),
      buildCache: vi.fn(),
    }
    const tool = listBucketsTool(deps as never)
    const result = await tenantContext.run({ tenantId: 't', userId: 'u' }, () =>
      tool.execute(
        { planId: 'P1' },
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
    const tool = listBucketsTool(deps as never)
    const result = await tenantContext.run({ tenantId: 't', userId: 'u' }, () =>
      tool.execute(
        { planId: 'P1' },
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
