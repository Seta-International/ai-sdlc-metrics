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

  it('listAllPlans paginates /planner/plans', async () => {
    const s = stubGraph()
    s.paginate.mockReturnValue(
      (async function* () {
        yield { id: 'P1' }
      })(),
    )
    const c = createPlannerClient({ graph: s.gf, actor: { type: 'user', userId: 'u' }, token: 't' })
    const out = []
    for await (const p of c.listAllPlans()) out.push(p)
    expect(out).toEqual([{ id: 'P1' }])
    expect(s.paginate).toHaveBeenCalledWith(expect.objectContaining({ path: '/planner/plans' }))
  })

  it('listPlanTasksDelta GETs delta endpoint and extracts nextDeltaToken', async () => {
    const s = stubGraph()
    s.call.mockResolvedValue({
      data: {
        value: [{ id: 'T1' }],
        '@odata.deltaLink':
          'https://graph.microsoft.com/v1.0/planner/plans/P1/tasks/delta?$deltatoken=tok42',
      },
      etag: null,
      status: 200,
    })
    const c = createPlannerClient({ graph: s.gf, actor: { type: 'user', userId: 'u' }, token: 't' })
    const result = await c.listPlanTasksDelta('P1')
    expect(result.items).toEqual([{ id: 'T1' }])
    expect(result.nextDeltaToken).toBe('tok42')
    expect(s.call).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/planner/plans/P1/tasks/delta' }),
    )
  })

  it('listPlanTasksDelta resumes from stored delta token', async () => {
    const s = stubGraph()
    s.call.mockResolvedValue({
      data: {
        value: [],
        '@odata.deltaLink':
          'https://graph.microsoft.com/v1.0/planner/plans/P1/tasks/delta?$deltatoken=tok99',
      },
      etag: null,
      status: 200,
    })
    const c = createPlannerClient({ graph: s.gf, actor: { type: 'user', userId: 'u' }, token: 't' })
    await c.listPlanTasksDelta('P1', 'prevTok')
    expect(s.call).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/planner/plans/P1/tasks/delta?$deltatoken=prevTok' }),
    )
  })

  it('listGroupMembers paginates /groups/:id/members', async () => {
    const s = stubGraph()
    s.paginate.mockReturnValue(
      (async function* () {
        yield { id: 'U1' }
      })(),
    )
    const c = createPlannerClient({ graph: s.gf, actor: { type: 'user', userId: 'u' }, token: 't' })
    const out = []
    for await (const m of c.listGroupMembers('G1')) out.push(m)
    expect(out).toEqual([{ id: 'U1' }])
    expect(s.paginate).toHaveBeenCalledWith(expect.objectContaining({ path: '/groups/G1/members' }))
  })
})
