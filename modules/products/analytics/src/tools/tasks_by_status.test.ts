import { tenantContext } from '@seta/tenant'
import { describe, expect, it, vi } from 'vitest'
import { tasksByStatusTool } from './tasks_by_status'

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

describe('tasksByStatusTool', () => {
  it('returns status breakdown', async () => {
    const sql = vi
      .fn<SqlFn>()
      .mockResolvedValueOnce([{ plan_id: 'p1' }])
      .mockResolvedValueOnce([
        { percent_complete: 0, count: 5 },
        { percent_complete: 50, count: 3 },
        { percent_complete: 100, count: 7 },
      ])
    const tool = tasksByStatusTool({ sql: sql as never })
    const result = await tenantContext.run({ tenantId: 't1', userId: 'u1' }, () =>
      tool.execute({}, makeCtx()),
    )
    expect('ok' in result && result.ok).toBe(true)
    if ('ok' in result && result.ok) {
      expect(result.value.rows).toHaveLength(3)
      expect(result.value.rows.find((r) => r.status === 'not_started')?.count).toBe(5)
    }
  })
})
