import { describe, expect, it, vi } from 'vitest'
import { createPlannerClient } from './client'

const stubGraph = () => {
  const call = vi.fn().mockResolvedValue({ data: { id: 'X' }, etag: 'W/"1"', status: 200 })
  const batch = vi.fn().mockResolvedValue([])
  const paginate = vi.fn()
  return { call, batch, paginate, gf: { call, batch, paginate } as never }
}

describe('PlannerClient', () => {
  it('getTask GETs /planner/tasks/:id', async () => {
    const s = stubGraph()
    const c = createPlannerClient({ graph: s.gf, actor: { type: 'user', userId: 'u' }, token: 't' })
    await c.getTask('T1')
    expect(s.call).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/planner/tasks/T1',
        token: 't',
        connectorId: 'ms365-planner',
      }),
    )
  })

  it('updateTask PATCHes with If-Match and Prefer: return=representation', async () => {
    const s = stubGraph()
    const c = createPlannerClient({ graph: s.gf, actor: { type: 'user', userId: 'u' }, token: 't' })
    await c.updateTask('T1', 'W/"old"', { title: 'new' })
    expect(s.call).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PATCH',
        path: '/planner/tasks/T1',
        etag: 'W/"old"',
        headers: expect.objectContaining({ Prefer: 'return=representation' }),
        body: { title: 'new' },
      }),
    )
  })

  it('createTask POSTs /planner/tasks with planId/bucketId/title', async () => {
    const s = stubGraph()
    const c = createPlannerClient({ graph: s.gf, actor: { type: 'user', userId: 'u' }, token: 't' })
    await c.createTask({ planId: 'P', bucketId: 'B', title: 't' })
    expect(s.call).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/planner/tasks',
        body: { planId: 'P', bucketId: 'B', title: 't' },
      }),
    )
  })

  it('listMyTasks paginates /me/planner/tasks', async () => {
    const s = stubGraph()
    s.paginate.mockReturnValue(
      (async function* () {
        yield { id: 'T1' }
      })(),
    )
    const c = createPlannerClient({ graph: s.gf, actor: { type: 'user', userId: 'u' }, token: 't' })
    const out = []
    for await (const t of c.listMyTasks()) out.push(t)
    expect(out).toEqual([{ id: 'T1' }])
    expect(s.paginate).toHaveBeenCalledWith(expect.objectContaining({ path: '/me/planner/tasks' }))
  })
})
