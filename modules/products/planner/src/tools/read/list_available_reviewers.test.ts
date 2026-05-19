import { describe, expect, it, vi } from 'vitest'
import { listAvailableReviewersTool } from './list_available_reviewers'

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

const makeReviewer = (overrides: Record<string, unknown> = {}) => ({
  entra_object_id: 'u1',
  display_name: 'Tran Thi B',
  user_principal_name: 'b@seta.vn',
  job_title: 'DevOps Engineer',
  department: 'Engineering',
  availability: 'Available',
  activity: 'Available',
  matched_skills: ['kubernetes', 'aws'],
  active_task_count: 2,
  active_task_titles: ['Deploy EKS cluster staging', 'Setup Prometheus alerts'],
  ...overrides,
})

describe('listAvailableReviewersTool', () => {
  it('returns reviewers with matched skills and active tasks', async () => {
    const sql = makeSql([makeReviewer()])
    const tool = listAvailableReviewersTool({ sql: sql as never })
    const result = await tool.execute({ skills: ['kubernetes', 'aws'] }, makeCtx())
    expect('ok' in result && result.ok).toBe(true)
    if ('ok' in result && result.ok) {
      expect(result.value.reviewers).toHaveLength(1)
      expect(result.value.reviewers[0].matched_skills).toEqual(['kubernetes', 'aws'])
      expect(result.value.reviewers[0].active_task_count).toBe(2)
      expect(result.value.reviewers[0].active_task_titles).toHaveLength(2)
    }
  })

  it('returns empty when no matching reviewers', async () => {
    const sql = makeSql([])
    const tool = listAvailableReviewersTool({ sql: sql as never })
    const result = await tool.execute({ skills: ['exotic-skill'] }, makeCtx())
    expect('ok' in result && result.ok).toBe(true)
    if ('ok' in result && result.ok) expect(result.value.reviewers).toHaveLength(0)
  })

  it('returns reviewers when myTeamOnly is true', async () => {
    const sql = makeSql([makeReviewer()])
    const tool = listAvailableReviewersTool({ sql: sql as never })
    const result = await tool.execute({ skills: ['kubernetes'], myTeamOnly: true }, makeCtx())
    expect('ok' in result && result.ok).toBe(true)
    if ('ok' in result && result.ok) expect(result.value.reviewers).toHaveLength(1)
  })

  it('surfaces reviewer with zero active tasks when idle', async () => {
    const sql = makeSql([makeReviewer({ active_task_count: 0, active_task_titles: [] })])
    const tool = listAvailableReviewersTool({ sql: sql as never })
    const result = await tool.execute({ skills: ['kubernetes'] }, makeCtx())
    expect('ok' in result && result.ok).toBe(true)
    if ('ok' in result && result.ok) {
      expect(result.value.reviewers[0].active_task_count).toBe(0)
      expect(result.value.reviewers[0].active_task_titles).toHaveLength(0)
    }
  })

  it('returns ok:false on sql error', async () => {
    const sql = vi
      .fn<(strings: TemplateStringsArray, ...v: unknown[]) => Promise<unknown[]>>()
      .mockRejectedValue(new Error('timeout'))
    const tool = listAvailableReviewersTool({ sql: sql as never })
    const result = await tool.execute({ skills: ['kubernetes'] }, makeCtx())
    expect('ok' in result && !result.ok).toBe(true)
    if ('ok' in result && !result.ok) expect(result.error.message).toBe('timeout')
  })
})
