import { GraphNotFound, GraphUnavailable } from '@seta/ms-graph'
import { tenantContext } from '@seta/tenant'
import { describe, expect, it, vi } from 'vitest'
import { createPlannerCache } from './cache'

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001'
const withTenant = <T>(fn: () => Promise<T>): Promise<T> =>
  tenantContext.run({ tenantId: TEST_TENANT_ID }, fn)

const TASK = { '@odata.etag': 'W/"1"', id: 'T1', title: 'a' }

const makeFakeSql = (rows: unknown[]) => {
  const sql = vi.fn().mockResolvedValue(rows)
  return sql as unknown as Parameters<typeof createPlannerCache>[0]['sql']
}

describe('plannerCache.task.one', () => {
  it('returns cache:fresh when synced_at is within TTL', async () => {
    const sql = makeFakeSql([{ graphTaskId: 'T1', etag: 'W/"1"', raw: TASK, syncedAt: new Date() }])
    const cache = createPlannerCache({
      sql,
      ttlTasksSec: 60,
      staleFallbackMaxSec: 3600,
      client: { getTask: vi.fn() } as never,
      now: () => Date.now(),
    })
    const r = await withTenant(() => cache.task.one('T1'))
    expect(r?.source).toBe('cache:fresh')
    expect(r?.data).toEqual(TASK)
  })

  it('fetches live on miss; returns source=live', async () => {
    const getTask = vi.fn().mockResolvedValue({ data: TASK, etag: 'W/"1"' })
    const sql = makeFakeSql([])
    const cache = createPlannerCache({
      sql,
      ttlTasksSec: 60,
      staleFallbackMaxSec: 3600,
      client: { getTask } as never,
      now: () => Date.now(),
    })
    const r = await withTenant(() => cache.task.one('T1'))
    expect(getTask).toHaveBeenCalledWith('T1')
    expect(r?.source).toBe('live')
    expect(r?.data).toEqual(TASK)
  })

  it('404 from Graph soft-deletes and returns null', async () => {
    const getTask = vi.fn().mockRejectedValue(new GraphNotFound('/planner/tasks/T1'))
    const sql = makeFakeSql([])
    const cache = createPlannerCache({
      sql,
      ttlTasksSec: 60,
      staleFallbackMaxSec: 3600,
      client: { getTask } as never,
      now: () => Date.now(),
    })
    expect(await withTenant(() => cache.task.one('T1'))).toBeNull()
    expect(sql).toHaveBeenCalledTimes(2) // SELECT + UPDATE soft_deleted_at
  })

  it('5xx returns cache:stale-fallback if stale row exists within max', async () => {
    const stale = {
      graphTaskId: 'T1',
      etag: 'W/"1"',
      raw: TASK,
      syncedAt: new Date(Date.now() - 5 * 60_000),
    }
    const sql = makeFakeSql([stale])
    const getTask = vi.fn().mockRejectedValue(new GraphUnavailable('5xx'))
    const cache = createPlannerCache({
      sql,
      ttlTasksSec: 60,
      staleFallbackMaxSec: 3600,
      client: { getTask } as never,
      now: () => Date.now(),
    })
    const r = await withTenant(() => cache.task.one('T1'))
    expect(r?.source).toBe('cache:stale-fallback')
  })

  it('5xx with no row rethrows GraphUnavailable', async () => {
    const sql = makeFakeSql([])
    const getTask = vi.fn().mockRejectedValue(new GraphUnavailable('5xx'))
    const cache = createPlannerCache({
      sql,
      ttlTasksSec: 60,
      staleFallbackMaxSec: 3600,
      client: { getTask } as never,
      now: () => Date.now(),
    })
    await expect(withTenant(() => cache.task.one('T1'))).rejects.toBeInstanceOf(GraphUnavailable)
  })
})
