import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetSubtasksHandler } from './get-subtasks.handler'
import { GetSubtasksQuery } from './get-subtasks.query'
import type { Db } from '@future/db'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const PARENT_TASK_ID = 'parent-task-1'

describe('GetSubtasksHandler', () => {
  let handler: GetSubtasksHandler
  let db: { execute: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    db = { execute: vi.fn() }
    handler = new GetSubtasksHandler(db as unknown as Db)
  })

  it('returns subtasks filtered by parentTaskId', async () => {
    db.execute.mockResolvedValue({
      rows: [
        { id: 'sub-1', title: 'First subtask', progress: 0, order_hint: '1|a:' },
        { id: 'sub-2', title: 'Second subtask', progress: 50, order_hint: '1|b:' },
      ],
    })

    const query = new GetSubtasksQuery(PARENT_TASK_ID, PLAN_ID, TENANT_ID)
    const result = await handler.execute(query)

    expect(db.execute).toHaveBeenCalledOnce()
    expect(result.subtasks).toHaveLength(2)
    expect(result.subtasks[0]).toEqual({
      id: 'sub-1',
      title: 'First subtask',
      progress: 0,
      orderHint: '1|a:',
    })
    expect(result.subtasks[1]).toEqual({
      id: 'sub-2',
      title: 'Second subtask',
      progress: 50,
      orderHint: '1|b:',
    })
  })

  it('returns empty array when no subtasks exist', async () => {
    db.execute.mockResolvedValue({ rows: [] })

    const query = new GetSubtasksQuery(PARENT_TASK_ID, PLAN_ID, TENANT_ID)
    const result = await handler.execute(query)

    expect(result.subtasks).toEqual([])
  })
})
