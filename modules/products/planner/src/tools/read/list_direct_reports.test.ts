import { describe, expect, it, vi } from 'vitest'
import { listDirectReportsTool } from './list_direct_reports'

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

describe('listDirectReportsTool', () => {
  it('returns direct reports from directory_users', async () => {
    const sql = makeSql([
      {
        entra_object_id: 'u1',
        display_name: 'Nguyen Van A',
        user_principal_name: 'a@seta.vn',
        job_title: 'DevOps Engineer',
        department: 'Engineering',
        availability: 'Available',
        activity: 'Available',
      },
    ])
    const tool = listDirectReportsTool({ sql: sql as never })
    const result = await tool.execute({}, makeCtx())
    expect('ok' in result && result.ok).toBe(true)
    if ('ok' in result && result.ok) {
      expect(result.value.reports).toHaveLength(1)
      expect(result.value.reports[0].display_name).toBe('Nguyen Van A')
    }
  })

  it('returns empty array when user has no direct reports', async () => {
    const sql = makeSql([])
    const tool = listDirectReportsTool({ sql: sql as never })
    const result = await tool.execute({}, makeCtx())
    expect('ok' in result && result.ok).toBe(true)
    if ('ok' in result && result.ok) expect(result.value.reports).toHaveLength(0)
  })

  it('returns ok:false on sql error', async () => {
    const sql = vi
      .fn<(strings: TemplateStringsArray, ...v: unknown[]) => Promise<unknown[]>>()
      .mockRejectedValue(new Error('connection refused'))
    const tool = listDirectReportsTool({ sql: sql as never })
    const result = await tool.execute({}, makeCtx())
    expect('ok' in result && !result.ok).toBe(true)
    if ('ok' in result && !result.ok) expect(result.error.message).toBe('connection refused')
  })
})
