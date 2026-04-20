import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '@future/db'
import { GetCarryOverCandidatesHandler } from './get-carry-over-candidates.handler'
import { GetCarryOverCandidatesQuery } from './get-carry-over-candidates.query'
import type { KernelQueryFacade } from '../../../../kernel/application/facades/kernel-query.facade'

describe('GetCarryOverCandidatesHandler', () => {
  const actorId = '00000000-0000-0000-0000-0000000000aa'
  const tenantId = '00000000-0000-0000-0000-0000000000bb'

  let handler: GetCarryOverCandidatesHandler
  let db: { execute: ReturnType<typeof vi.fn> }
  let kernel: { getActorsByIds: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    db = { execute: vi.fn() }
    kernel = { getActorsByIds: vi.fn().mockResolvedValue(new Map()) }
    handler = new GetCarryOverCandidatesHandler(
      db as unknown as Db,
      kernel as unknown as KernelQueryFacade,
    )
  })

  it('rejects invalid today format with an "invalid date" error', async () => {
    await expect(
      handler.execute(new GetCarryOverCandidatesQuery(actorId, tenantId, 'not-a-date')),
    ).rejects.toThrow(/invalid date/i)
    expect(db.execute).not.toHaveBeenCalled()
  })

  it('returns [] early and runs only one query when no candidates exist', async () => {
    db.execute.mockResolvedValueOnce({ rows: [] })

    const result = await handler.execute(
      new GetCarryOverCandidatesQuery(actorId, tenantId, '2026-04-20'),
    )

    expect(result).toEqual([])
    expect(db.execute).toHaveBeenCalledTimes(1)
  })

  it('computes yesterday as today - 1 day and uses it in the SQL params', async () => {
    db.execute.mockResolvedValueOnce({ rows: [] })

    await handler.execute(new GetCarryOverCandidatesQuery(actorId, tenantId, '2026-04-20'))

    const firstCall = db.execute.mock.calls[0][0]
    const chunks = (firstCall?.queryChunks ?? []) as unknown[]
    // Primitive values (bound params) show up as plain strings/numbers in queryChunks.
    expect(chunks).toContain('2026-04-19')
    expect(chunks).not.toContain('2026-04-20')
  })

  it('also handles month/year rollover when computing yesterday', async () => {
    db.execute.mockResolvedValueOnce({ rows: [] })

    await handler.execute(new GetCarryOverCandidatesQuery(actorId, tenantId, '2026-03-01'))

    const firstCall = db.execute.mock.calls[0][0]
    const chunks = (firstCall?.queryChunks ?? []) as unknown[]
    expect(chunks).toContain('2026-02-28')
  })

  it('maps rows into MyDayTask shape with myDay fields populated', async () => {
    const addedAt = new Date('2026-04-19T08:00:00Z')

    db.execute
      .mockResolvedValueOnce({
        rows: [
          {
            task_id: 't1',
            plan_id: 'p1',
            plan_name: 'My Plan',
            plan_owner_actor_id: actorId,
            bucket_id: 'b1',
            bucket_name: 'Inbox',
            bucket_order_hint: '0|hzzzzz:',
            title: 'Finish me',
            progress: 0,
            priority: 5,
            start_date: null,
            due_date: null,
            order_hint: '0|azzzzz:',
            checklist_item_count: 0,
            checklist_checked_count: 0,
            attachment_count: 0,
            comment_count: 0,
            created_at: new Date('2026-04-19T00:00:00Z'),
            updated_at: new Date('2026-04-19T00:00:00Z'),
            added_at: addedAt,
            completed_at: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ task_id: 't1', actor_id: actorId }] })
      .mockResolvedValueOnce({ rows: [] })

    kernel.getActorsByIds.mockResolvedValue(
      new Map([[actorId, { displayName: 'Alice', avatarUrl: null }]]),
    )

    const result = await handler.execute(
      new GetCarryOverCandidatesQuery(actorId, tenantId, '2026-04-20'),
    )

    expect(result).toHaveLength(1)
    const task = result[0]!
    expect(task.id).toBe('t1')
    expect(task.planKind).toBe('personal')
    expect(task.myDay.addedAt).toBe(addedAt.toISOString())
    expect(task.myDay.completedAt).toBeNull()
    expect(task.assignees[0]?.displayName).toBe('Alice')
  })
})
