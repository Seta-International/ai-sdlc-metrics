import { describe, expect, it, vi } from 'vitest'
import { listPlansTool } from './list_plans'

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

describe('listPlansTool', () => {
  it('returns plans from v_visible_plans', async () => {
    const sql = makeSql([{ graph_plan_id: 'p1', title: 'Atlas' }])
    const tool = listPlansTool({ sql: sql as never })
    const result = await tool.execute({ limit: 20 }, makeCtx())
    expect('ok' in result && result.ok).toBe(true)
    if ('ok' in result && result.ok) expect(result.value.plans).toHaveLength(1)
  })

  it('returns empty when no plans visible', async () => {
    const sql = makeSql([])
    const tool = listPlansTool({ sql: sql as never })
    const result = await tool.execute({ limit: 20 }, makeCtx())
    expect('ok' in result && result.ok).toBe(true)
    if ('ok' in result && result.ok) expect(result.value.plans).toHaveLength(0)
  })
})
