import { tenantContext } from '@seta/tenant'
import { describe, expect, it, vi } from 'vitest'
import { tasksByPlanTool } from './tasks_by_plan'

type SqlFn = (strings: TemplateStringsArray, ...v: unknown[]) => Promise<unknown[]>

const makeCtx = () =>
  ({
    surface: 'direct',
    abortSignal: new AbortController().signal,
    runId: 'r1',
    requestContext: {
      runId: 'r1',
      signal: new AbortController().signal,
      retryCount: 0,
      now: Date.now,
      generateId: () => 'id',
      currentDate: () => new Date(),
    },
  }) as never

describe('tasksByPlanTool', () => {
  it('returns open count per plan', async () => {
    const workloadRow = { plan_id: 'p1', count: 8 }
    const planRow = { graph_plan_id: 'p1', title: 'Atlas' }
    const memberRow = { plan_id: 'p1' }
    const sql = vi
      .fn<SqlFn>()
      .mockResolvedValueOnce([memberRow])
      .mockResolvedValueOnce([workloadRow])
      .mockResolvedValueOnce([planRow])
    const tool = tasksByPlanTool({ sql: sql as never })
    const result = await tenantContext.run({ tenantId: 't1', userId: 'u1' }, () =>
      tool.execute({ metric: 'open', limit: 10 }, makeCtx()),
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.rows[0]?.planName).toBe('Atlas')
      expect(result.value.rows[0]?.count).toBe(8)
    }
  })
})
