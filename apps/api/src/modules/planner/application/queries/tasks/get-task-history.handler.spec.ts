import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetTaskHistoryHandler } from './get-task-history.handler'
import { GetTaskHistoryQuery } from './get-task-history.query'
import type { ITaskHistoryRepository } from '../../../domain/repositories/task-history.repository'

const TASK_ID = 'task-hist-q-1'
const TENANT_ID = 'tenant-hist-q-1'

describe('GetTaskHistoryHandler', () => {
  let handler: GetTaskHistoryHandler
  let repo: {
    append: ReturnType<typeof vi.fn>
    listByTask: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    repo = {
      append: vi.fn().mockResolvedValue(undefined),
      listByTask: vi.fn().mockResolvedValue({
        items: [
          {
            id: 'h-1',
            taskId: TASK_ID,
            tenantId: TENANT_ID,
            actorId: 'actor-1',
            field: 'priority',
            oldValue: 3,
            newValue: 5,
            changedAt: new Date('2026-05-01T10:00:00Z'),
          },
        ],
        nextCursor: null,
      }),
    }
    handler = new GetTaskHistoryHandler(repo as unknown as ITaskHistoryRepository)
  })

  it('delegates to repo.listByTask with correct args', async () => {
    const query = new GetTaskHistoryQuery(TASK_ID, TENANT_ID, undefined, 20)
    const result = await handler.execute(query)

    expect(repo.listByTask).toHaveBeenCalledOnce()
    expect(repo.listByTask).toHaveBeenCalledWith(TASK_ID, TENANT_ID, {
      cursor: undefined,
      limit: 20,
    })
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.field).toBe('priority')
    expect(result.nextCursor).toBeNull()
  })

  it('passes cursor through to repo.listByTask', async () => {
    const cursor = '2026-05-01T10:00:00.000Z:some-uuid-id-here-1234'
    repo.listByTask.mockResolvedValue({ items: [], nextCursor: null })

    const query = new GetTaskHistoryQuery(TASK_ID, TENANT_ID, cursor, 10)
    await handler.execute(query)

    expect(repo.listByTask).toHaveBeenCalledWith(TASK_ID, TENANT_ID, {
      cursor,
      limit: 10,
    })
  })
})
