import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '@future/db'
import { GetMyDayHandler } from './get-my-day.handler'
import { GetMyDayQuery } from './get-my-day.query'
import type { KernelQueryFacade } from '../../../../kernel/application/facades/kernel-query.facade'

describe('GetMyDayHandler', () => {
  const actorId = '00000000-0000-0000-0000-0000000000aa'
  const tenantId = '00000000-0000-0000-0000-0000000000bb'
  const date = '2026-04-20'

  let handler: GetMyDayHandler
  let db: { execute: ReturnType<typeof vi.fn> }
  let kernel: { getActorsByIds: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    db = { execute: vi.fn() }
    kernel = { getActorsByIds: vi.fn().mockResolvedValue(new Map()) }
    handler = new GetMyDayHandler(db as unknown as Db, kernel as unknown as KernelQueryFacade)
  })

  it('returns an empty array when no my_day_entry rows exist for (actor, tenant, date)', async () => {
    db.execute.mockResolvedValueOnce({ rows: [] })

    const result = await handler.execute(new GetMyDayQuery(actorId, tenantId, date))

    expect(result).toEqual([])
    // Only the first query should have run — early-exit before assignee/label queries
    expect(db.execute).toHaveBeenCalledTimes(1)
  })

  it('maps rows into MyDayTask shape with myDay.addedAt and myDay.completedAt', async () => {
    const addedAt = new Date('2026-04-20T08:00:00Z')

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
            title: 'Write tests',
            progress: 0,
            priority: 5,
            start_date: null,
            due_date: null,
            order_hint: '0|azzzzz:',
            checklist_item_count: 0,
            checklist_checked_count: 0,
            attachment_count: 0,
            comment_count: 0,
            created_at: new Date('2026-04-20T00:00:00Z'),
            updated_at: new Date('2026-04-20T00:00:00Z'),
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

    const result = await handler.execute(new GetMyDayQuery(actorId, tenantId, date))

    expect(result).toHaveLength(1)
    const task = result[0]!
    expect(task.id).toBe('t1')
    expect(task.planKind).toBe('personal')
    expect(task.myDay.addedAt).toBe(addedAt.toISOString())
    expect(task.myDay.completedAt).toBeNull()
    // Verify assignee enrichment also works
    expect(task.assignees[0]?.displayName).toBe('Alice')
  })
})
