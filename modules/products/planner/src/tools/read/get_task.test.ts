import { describe, expect, it, vi } from 'vitest'
import { getTaskTool } from './get_task.js'

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

describe('getTaskTool', () => {
  it('returns task when found', async () => {
    const sql = makeSql([{ graph_task_id: 't1', title: 'Task A', percent_complete: 50 }])
    const tool = getTaskTool({ sql: sql as never })
    const result = await tool.execute({ taskId: 't1' }, makeCtx())
    expect('ok' in result && result.ok).toBe(true)
    if ('ok' in result && result.ok) expect(result.value.task).not.toBeNull()
  })

  it('returns null task when not found', async () => {
    const sql = makeSql([])
    const tool = getTaskTool({ sql: sql as never })
    const result = await tool.execute({ taskId: 'missing' }, makeCtx())
    expect('ok' in result && result.ok).toBe(true)
    if ('ok' in result && result.ok) expect(result.value.task).toBeNull()
  })
})
