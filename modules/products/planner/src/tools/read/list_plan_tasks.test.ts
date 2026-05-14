import { describe, expect, it, vi } from 'vitest'
import { listPlanTasksTool } from './list_plan_tasks.js'

const makeSql = (rows: unknown[]) =>
  vi
    .fn<(strings: TemplateStringsArray, ...v: unknown[]) => Promise<unknown[]>>()
    .mockResolvedValue(rows)

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

describe('listPlanTasksTool', () => {
  it('returns tasks for a plan', async () => {
    const sql = makeSql([{ graph_task_id: 't1', title: 'Implement X', percent_complete: 0 }])
    const tool = listPlanTasksTool({ sql: sql as never })
    const result = await tool.execute({ planId: 'p1', limit: 50 }, makeCtx())
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.tasks).toHaveLength(1)
  })

  it('returns empty when view returns no rows', async () => {
    const sql = makeSql([])
    const tool = listPlanTasksTool({ sql: sql as never })
    const result = await tool.execute({ planId: 'p1', limit: 50 }, makeCtx())
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.tasks).toHaveLength(0)
  })
})
