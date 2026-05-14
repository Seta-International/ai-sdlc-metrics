import { describe, expect, it, vi } from 'vitest'
import { listMyTasksTool } from './list_my_tasks.js'

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

describe('listMyTasksTool', () => {
  it('returns tasks from planner.v_visible_tasks', async () => {
    const sql = makeSql([
      {
        graph_task_id: 't1',
        title: 'Fix bug',
        percent_complete: 0,
        due_date: null,
        assignee_ids: ['u1'],
      },
    ])
    const tool = listMyTasksTool({ sql: sql as never })
    const result = await tool.execute({ timeRange: 'today', limit: 20 }, makeCtx())
    expect('ok' in result && result.ok).toBe(true)
    if ('ok' in result && result.ok) expect(result.value.tasks).toHaveLength(1)
  })

  it('returns empty when view returns no rows', async () => {
    const sql = makeSql([])
    const tool = listMyTasksTool({ sql: sql as never })
    const result = await tool.execute({ timeRange: 'today', limit: 20 }, makeCtx())
    expect('ok' in result && result.ok).toBe(true)
    if ('ok' in result && result.ok) {
      expect(result.value.tasks).toHaveLength(0)
      expect(result.value.summary.total).toBe(0)
    }
  })
})
