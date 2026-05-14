import { tenantContext } from '@seta/tenant'
import { describe, expect, it, vi } from 'vitest'
import { workloadByAssigneeTool } from './workload_by_assignee'

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

describe('workloadByAssigneeTool', () => {
  it('returns rows with display names from directory', async () => {
    const workloadRow = {
      user_id: 'u1',
      plan_id: 'p1',
      open_tasks: 5,
      overdue_tasks: 1,
      due_this_week: 2,
      completed_this_week: 3,
      tenant_id: 't1',
    }
    const dirRow = { entra_object_id: 'u1', display_name: 'Alice' }
    const sql = vi
      .fn<SqlFn>()
      .mockResolvedValueOnce([{ plan_id: 'p1' }])
      .mockResolvedValueOnce([workloadRow])
      .mockResolvedValueOnce([dirRow])
    const tool = workloadByAssigneeTool({ sql: sql as never })
    const result = await tenantContext.run({ tenantId: 't1', userId: 'u1' }, () =>
      tool.execute({ limit: 20 }, makeCtx()),
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.rows[0]?.displayName).toBe('Alice')
      expect(result.value.rows[0]?.openTasks).toBe(5)
    }
  })

  it('falls back to user_id when display name not found', async () => {
    const workloadRow = {
      user_id: 'u2',
      plan_id: 'p1',
      open_tasks: 3,
      overdue_tasks: 0,
      due_this_week: 1,
      completed_this_week: 0,
      tenant_id: 't1',
    }
    const sql = vi
      .fn<SqlFn>()
      .mockResolvedValueOnce([{ plan_id: 'p1' }])
      .mockResolvedValueOnce([workloadRow])
      .mockResolvedValueOnce([])
    const tool = workloadByAssigneeTool({ sql: sql as never })
    const result = await tenantContext.run({ tenantId: 't1', userId: 'u1' }, () =>
      tool.execute({ limit: 20 }, makeCtx()),
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.rows[0]?.displayName).toBe('u2')
  })
})
