import { describe, expect, it, vi } from 'vitest'
import { listBucketsTool } from './list_buckets.js'

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

describe('listBucketsTool', () => {
  it('returns buckets for a plan', async () => {
    const sql = makeSql([{ graph_bucket_id: 'b1', name: 'Backlog' }])
    const tool = listBucketsTool({ sql: sql as never })
    const result = await tool.execute({ planId: 'p1' }, makeCtx())
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.buckets).toHaveLength(1)
  })

  it('returns empty when no buckets found', async () => {
    const sql = makeSql([])
    const tool = listBucketsTool({ sql: sql as never })
    const result = await tool.execute({ planId: 'p1' }, makeCtx())
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.buckets).toHaveLength(0)
  })
})
