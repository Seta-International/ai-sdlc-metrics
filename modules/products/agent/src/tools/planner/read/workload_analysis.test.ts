import { tenantContext } from '@seta/tenant'
import { describe, expect, it, vi } from 'vitest'
import { workloadAnalysisTool } from './workload_analysis'

describe('planner.workload_analysis', () => {
  it('aggregates per assignee with overdue + in-progress counts', async () => {
    const sql = vi.fn().mockResolvedValue([
      { assigneeId: 'a1', taskCount: 3, overdueCount: 1, inProgressCount: 2 },
      { assigneeId: 'a2', taskCount: 1, overdueCount: 0, inProgressCount: 1 },
    ])
    const directory = {
      displayName: vi
        .fn()
        .mockImplementation((id: string) => Promise.resolve(id === 'a1' ? 'Alice' : null)),
    }
    const deps = {
      registry: { requireConsent: vi.fn().mockResolvedValue(undefined) },
      buildSql: () => sql,
      directory,
    }
    const tool = workloadAnalysisTool(deps as never)
    const r = await tenantContext.run({ tenantId: 't1', userId: 'u1' }, () =>
      tool.execute(
        { scope: { kind: 'plan', planId: 'P1' } },
        {
          surface: 'direct',
          abortSignal: new AbortController().signal,
          runId: 'r',
          requestContext: {} as never,
        },
      ),
    )
    expect('ok' in r && r.ok).toBe(true)
    if ('ok' in r && r.ok) {
      expect(r.value.rows[0]).toMatchObject({
        assigneeId: 'a1',
        displayName: 'Alice',
        taskCount: 3,
      })
      expect(r.value.rows[1]).toMatchObject({ assigneeId: 'a2', displayName: '(unknown)' })
      expect(r.value.chart.type).toBe('bar')
      expect(r.value.chart.series[0]?.label).toBe('Open tasks')
    }
  })

  it('fails on consent rejection', async () => {
    const sql = vi.fn()
    const directory = { displayName: vi.fn() }
    const deps = {
      registry: { requireConsent: vi.fn().mockRejectedValue(new Error('no consent')) },
      buildSql: () => sql,
      directory,
    }
    const tool = workloadAnalysisTool(deps as never)
    const r = await tenantContext.run({ tenantId: 't1', userId: 'u1' }, () =>
      tool.execute(
        { scope: { kind: 'plan', planId: 'P1' } },
        {
          surface: 'direct',
          abortSignal: new AbortController().signal,
          runId: 'r',
          requestContext: {} as never,
        },
      ),
    )
    expect('ok' in r && r.ok).toBe(false)
    if ('ok' in r && !r.ok) expect(r.error.message).toBe('no consent')
  })
})
