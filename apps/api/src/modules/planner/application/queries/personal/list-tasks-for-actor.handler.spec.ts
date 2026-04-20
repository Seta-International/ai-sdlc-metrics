import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '@future/db'
import { ListTasksForActorHandler } from './list-tasks-for-actor.handler'
import { ListTasksForActorQuery } from './list-tasks-for-actor.query'
import type { KernelQueryFacade } from '../../../../kernel/application/facades/kernel-query.facade'

/**
 * Drizzle sql`` templates store raw string parts in nested `queryChunks[].value[]`.
 * Recursively collect all string values so test assertions can inspect the SQL text
 * without depending on internal chunk boundaries.
 */
function extractSqlStrings(obj: unknown): string {
  if (!obj || typeof obj !== 'object') return ''
  const o = obj as Record<string, unknown>
  const parts: string[] = []
  if (Array.isArray(o['value'])) {
    for (const v of o['value'] as unknown[]) {
      if (typeof v === 'string') parts.push(v)
    }
  }
  if (Array.isArray(o['queryChunks'])) {
    for (const chunk of o['queryChunks'] as unknown[]) {
      parts.push(extractSqlStrings(chunk))
    }
  }
  return parts.join(' ')
}

describe('ListTasksForActorHandler', () => {
  const actorId = '00000000-0000-0000-0000-0000000000aa'
  const tenantId = '00000000-0000-0000-0000-0000000000bb'
  let handler: ListTasksForActorHandler
  let db: { execute: ReturnType<typeof vi.fn> }
  let kernel: { getActorsByIds: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    db = { execute: vi.fn() }
    kernel = { getActorsByIds: vi.fn().mockResolvedValue(new Map()) }
    handler = new ListTasksForActorHandler(
      db as unknown as Db,
      kernel as unknown as KernelQueryFacade,
    )
  })

  it('returns TaskFlatWithPlan[] with planName and planKind populated', async () => {
    db.execute
      .mockResolvedValueOnce({
        rows: [
          {
            task_id: 't1',
            plan_id: 'p1',
            plan_name: 'Team Alpha',
            plan_owner_actor_id: null,
            bucket_id: 'b1',
            bucket_name: 'To do',
            bucket_order_hint: '0|hzzzzz:',
            title: 'Ship it',
            progress: 50,
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
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ task_id: 't1', actor_id: actorId }] })
      .mockResolvedValueOnce({ rows: [] })

    const result = await handler.execute(
      new ListTasksForActorQuery(actorId, tenantId, { includeCompleted: false }),
    )

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 't1',
      planId: 'p1',
      planName: 'Team Alpha',
      planKind: 'team',
      progress: 'in-progress',
      priority: 'medium',
    })
  })

  it('marks plan as personal when owner_actor_id equals the actor', async () => {
    db.execute
      .mockResolvedValueOnce({
        rows: [
          {
            task_id: 't2',
            plan_id: 'pp1',
            plan_name: 'Personal',
            plan_owner_actor_id: actorId,
            bucket_id: 'b2',
            bucket_name: 'Inbox',
            bucket_order_hint: '0|hzzzzz:',
            title: 'Write tests',
            progress: 0,
            priority: 5,
            start_date: null,
            due_date: null,
            order_hint: '0|bzzzzz:',
            checklist_item_count: 0,
            checklist_checked_count: 0,
            attachment_count: 0,
            comment_count: 0,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ task_id: 't2', actor_id: actorId }] })
      .mockResolvedValueOnce({ rows: [] })

    const [task] = await handler.execute(
      new ListTasksForActorQuery(actorId, tenantId, { includeCompleted: false }),
    )
    expect(task!.planKind).toBe('personal')
  })

  it('excludes completed tasks by default (includeCompleted=false)', async () => {
    db.execute
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
    await handler.execute(
      new ListTasksForActorQuery(actorId, tenantId, { includeCompleted: false }),
    )
    const sqlText = extractSqlStrings(db.execute.mock.calls[0]?.[0])
    expect(sqlText).toMatch(/progress\s*<\s*100/i)
  })

  it('includes completed tasks when includeCompleted=true', async () => {
    db.execute
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
    await handler.execute(new ListTasksForActorQuery(actorId, tenantId, { includeCompleted: true }))
    const sqlText = extractSqlStrings(db.execute.mock.calls[0]?.[0])
    expect(sqlText).not.toMatch(/progress\s*<\s*100/i)
  })

  it('issues queries sequentially (no Promise.all)', async () => {
    let inFlight = 0
    let maxConcurrent = 0
    db.execute.mockImplementation(async () => {
      inFlight += 1
      maxConcurrent = Math.max(maxConcurrent, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight -= 1
      return { rows: [] }
    })
    await handler.execute(
      new ListTasksForActorQuery(actorId, tenantId, { includeCompleted: false }),
    )
    expect(maxConcurrent).toBe(1)
  })
})
