import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPlannerSyncWorker } from './sync'

function stubGraph() {
  const call = vi.fn()
  const paginate = vi.fn()
  const batch = vi.fn()
  return { call, paginate, batch, gf: { call, batch, paginate } as never }
}

function makeSql() {
  const fn = vi.fn().mockResolvedValue([])
  // withTenant calls db.begin(async (tx) => { await tx`set_config`; return userFn(tx) })
  // Use a passthrough tx that delegates to fn so set_config calls don't consume sequenced values
  fn.begin = vi.fn().mockImplementation((callback: (tx: unknown) => unknown) => {
    const tx = Object.assign(
      (strings: TemplateStringsArray, ...values: unknown[]) => fn(strings, ...values),
      { array: (arr: unknown[]) => arr },
    )
    return callback(tx)
  })
  fn.array = (arr: unknown[]) => arr
  return fn as unknown as import('@seta/db').DbSql
}

const TENANT = '00000000-0000-0000-0000-000000000001'

describe('createPlannerSyncWorker', () => {
  let g: ReturnType<typeof stubGraph>
  let sql: ReturnType<typeof makeSql>

  beforeEach(() => {
    g = stubGraph()
    sql = makeSql()
  })

  it('syncTenant: upserts plans returned by listAllPlans', async () => {
    g.paginate.mockImplementation(({ path }: { path: string }) => {
      if (path === '/planner/plans') {
        return (async function* () {
          yield { id: 'P1', owner: 'G1', title: 'Plan One', container: { url: 'https://x' } }
        })()
      }
      return (async function* () {})()
    })
    g.call.mockResolvedValue({
      data: {
        value: [],
        '@odata.deltaLink':
          'https://graph.microsoft.com/v1.0/planner/plans/P1/tasks/delta?$deltatoken=T1',
      },
      etag: null,
      status: 200,
    })
    // planRows query returns P1
    sql.mockResolvedValueOnce([{ graph_plan_id: 'P1', owner_group_id: 'G1' }])

    const worker = createPlannerSyncWorker({
      db: sql,
      graph: g.gf,
      getAppToken: async () => 'tok',
    })
    await worker.syncTenant(TENANT)

    expect(sql).toHaveBeenCalled()
    expect(g.paginate).toHaveBeenCalledWith(expect.objectContaining({ path: '/planner/plans' }))
  })

  it('syncTenant: calls afterSync with IDs of upserted tasks', async () => {
    const afterSync = vi.fn()
    g.paginate.mockImplementation(({ path }: { path: string }) => {
      if (path === '/planner/plans') {
        return (async function* () {
          yield { id: 'P1', owner: 'G1', title: 'Plan One' }
        })()
      }
      return (async function* () {
        yield { id: 'U1' }
      })()
    })
    g.call.mockResolvedValue({
      data: {
        value: [{ id: 'T1', planId: 'P1', assignments: {}, percentComplete: 0, priority: 1 }],
        '@odata.deltaLink':
          'https://graph.microsoft.com/v1.0/planner/plans/P1/tasks/delta?$deltatoken=T1',
      },
      etag: null,
      status: 200,
    })
    sql
      .mockResolvedValueOnce([]) // deltaToken watermark lookup
      .mockResolvedValueOnce([{ graph_plan_id: 'P1', owner_group_id: 'G1' }]) // planRows query

    const worker = createPlannerSyncWorker({
      db: sql,
      graph: g.gf,
      getAppToken: async () => 'tok',
      afterSync,
    })
    await worker.syncTenant(TENANT)

    expect(afterSync).toHaveBeenCalledWith(TENANT, ['T1'])
  })

  it('syncTenant: does NOT call afterSync when no tasks changed', async () => {
    const afterSync = vi.fn()
    g.paginate.mockImplementation(({ path }: { path: string }) => {
      if (path === '/planner/plans') {
        return (async function* () {
          yield { id: 'P1', owner: 'G1', title: 'Plan One' }
        })()
      }
      return (async function* () {})()
    })
    g.call.mockResolvedValue({
      data: {
        value: [],
        '@odata.deltaLink':
          'https://graph.microsoft.com/v1.0/planner/plans/P1/tasks/delta?$deltatoken=T1',
      },
      etag: null,
      status: 200,
    })
    sql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ graph_plan_id: 'P1', owner_group_id: 'G1' }])

    const worker = createPlannerSyncWorker({
      db: sql,
      graph: g.gf,
      getAppToken: async () => 'tok',
      afterSync,
    })
    await worker.syncTenant(TENANT)

    expect(afterSync).not.toHaveBeenCalled()
  })

  it('syncTenant: uses stored delta token on subsequent sync', async () => {
    g.paginate.mockImplementation(({ path }: { path: string }) => {
      if (path === '/planner/plans') {
        return (async function* () {
          yield { id: 'P1', owner: 'G1', title: 'P' }
        })()
      }
      return (async function* () {})()
    })
    g.call.mockResolvedValue({
      data: {
        value: [],
        '@odata.deltaLink':
          'https://graph.microsoft.com/v1.0/planner/plans/P1/tasks/delta?$deltatoken=NEW',
      },
      etag: null,
      status: 200,
    })
    sql
      .mockResolvedValueOnce([]) // set_config inside withTenant
      .mockResolvedValueOnce([{ delta_token: 'STORED_TOKEN' }]) // watermark SELECT

    const worker = createPlannerSyncWorker({
      db: sql,
      graph: g.gf,
      getAppToken: async () => 'tok',
    })
    await worker.syncTenant(TENANT)

    expect(g.call).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/planner/plans/P1/tasks/delta?$deltatoken=STORED_TOKEN',
      }),
    )
  })

  it('start / stop: does not throw; stop clears the timer', () => {
    vi.useFakeTimers()
    const worker = createPlannerSyncWorker({
      db: sql,
      graph: g.gf,
      getAppToken: async () => 'tok',
      intervalMs: 5000,
    })
    worker.start([TENANT])
    worker.stop()
    vi.useRealTimers()
  })
})
