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

describe('plannerCache.plan.one', () => {
  it('returns cache:fresh when synced_at is within TTL', async () => {
    const PLAN = { id: 'P1', title: 'My Plan' }
    const sql = makeFakeSql([{ graphPlanId: 'P1', etag: 'W/"p"', raw: PLAN, syncedAt: new Date() }])
    const cache = createPlannerCache({
      sql,
      ttlTasksSec: 60,
      staleFallbackMaxSec: 3600,
      client: {
        getTask: vi.fn(),
        listMyPlans: vi.fn(),
        getPlan: vi.fn(),
        getBucket: vi.fn(),
        getTaskDetails: vi.fn(),
        listBuckets: vi.fn(),
      } as never,
      now: () => Date.now(),
    })
    const r = await withTenant(() => cache.plan.one('P1'))
    expect(r?.source).toBe('cache:fresh')
  })

  it('fetches live on miss', async () => {
    const PLAN = { id: 'P1', title: 'My Plan' }
    const getPlan = vi.fn().mockResolvedValue({ data: PLAN, etag: 'W/"p"' })
    const sql = makeFakeSql([])
    const cache = createPlannerCache({
      sql,
      ttlTasksSec: 60,
      staleFallbackMaxSec: 3600,
      client: { getPlan } as never,
      now: () => Date.now(),
    })
    const r = await withTenant(() => cache.plan.one('P1'))
    expect(getPlan).toHaveBeenCalledWith('P1')
    expect(r?.source).toBe('live')
    expect(r?.data).toEqual(PLAN)
  })
})

describe('plannerCache.bucket.one', () => {
  it('returns cache:fresh when synced_at is within TTL', async () => {
    const BUCKET = { id: 'B1', name: 'Backlog' }
    const sql = makeFakeSql([
      { graphBucketId: 'B1', etag: 'W/"b"', raw: BUCKET, syncedAt: new Date() },
    ])
    const cache = createPlannerCache({
      sql,
      ttlTasksSec: 60,
      staleFallbackMaxSec: 3600,
      client: {} as never,
      now: () => Date.now(),
    })
    const r = await withTenant(() => cache.bucket.one('B1'))
    expect(r?.source).toBe('cache:fresh')
  })
})

describe('plannerCache.taskDetails.one', () => {
  it('returns cache:fresh when synced_at is within TTL', async () => {
    const DETAILS = { id: 'T1', description: 'desc' }
    const sql = makeFakeSql([
      { graphTaskId: 'T1', etag: 'W/"d"', raw: DETAILS, syncedAt: new Date() },
    ])
    const cache = createPlannerCache({
      sql,
      ttlTasksSec: 60,
      staleFallbackMaxSec: 3600,
      client: {} as never,
      now: () => Date.now(),
    })
    const r = await withTenant(() => cache.taskDetails.one('T1'))
    expect(r?.source).toBe('cache:fresh')
  })
})

describe('plannerCache.task.upsert', () => {
  it('calls sql with INSERT ... ON CONFLICT for a task', async () => {
    const sql = makeFakeSql([])
    const cache = createPlannerCache({
      sql,
      ttlTasksSec: 60,
      staleFallbackMaxSec: 3600,
      client: {} as never,
      now: () => Date.now(),
    })
    await withTenant(() => cache.task.upsert('T1', 'W/"1"', { id: 'T1' }))
    expect(sql).toHaveBeenCalled()
  })
})

describe('plannerCache.task.softDelete', () => {
  it('calls sql to set soft_deleted_at for a task', async () => {
    const sql = makeFakeSql([])
    const cache = createPlannerCache({
      sql,
      ttlTasksSec: 60,
      staleFallbackMaxSec: 3600,
      client: {} as never,
      now: () => Date.now(),
    })
    await withTenant(() => cache.task.softDelete('T1'))
    expect(sql).toHaveBeenCalled()
  })
})
