import { tenantContext } from '@seta/tenant'
import { describe, expect, it, vi } from 'vitest'
import { listPlanTasksTool } from './list_plan_tasks'

describe('planner.list_plan_tasks', () => {
  it('lists tasks for a plan', async () => {
    const deps = {
      registry: { requireConsent: vi.fn().mockResolvedValue(undefined) },
      tokenForUser: vi.fn().mockResolvedValue({ accessToken: 'tk' }),
      buildClient: vi.fn().mockReturnValue({
        listPlanTasks: async function* () {
          yield { id: 'T3' }
        },
      }),
      buildCache: vi.fn(),
    }
    const tool = listPlanTasksTool(deps as never)
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
    if ('ok' in result && result.ok) expect(result.value.items).toHaveLength(1)
  })

  it('fails when consent missing', async () => {
    const deps = {
      registry: { requireConsent: vi.fn().mockRejectedValue(new Error('no consent')) },
      tokenForUser: vi.fn(),
      buildClient: vi.fn(),
      buildCache: vi.fn(),
    }
    const tool = listPlanTasksTool(deps as never)
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
