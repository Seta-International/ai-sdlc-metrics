import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TaskProgressSetEvent } from '@future/event-contracts'
import { OnTaskProgressCompletedHandler } from './on-task-progress-completed.handler'
import type { IMyDayRepository } from '../../domain/repositories/my-day.repository'

const TENANT_ID = 'tenant-1'
const ACTOR_ID = 'actor-1'
const TASK_ID = 'task-1'
const PLAN_ID = 'plan-1'

describe('OnTaskProgressCompletedHandler', () => {
  let handler: OnTaskProgressCompletedHandler
  let repo: {
    add: ReturnType<typeof vi.fn>
    findForDate: ReturnType<typeof vi.fn>
    remove: ReturnType<typeof vi.fn>
    markTaskCompleted: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    repo = {
      add: vi.fn().mockResolvedValue(undefined),
      findForDate: vi.fn().mockResolvedValue([]),
      remove: vi.fn().mockResolvedValue(undefined),
      markTaskCompleted: vi.fn().mockResolvedValue(undefined),
    }
    handler = new OnTaskProgressCompletedHandler(repo as unknown as IMyDayRepository)
  })

  it('calls repo.markTaskCompleted when progress = 100', async () => {
    await handler.handle(new TaskProgressSetEvent(TENANT_ID, ACTOR_ID, TASK_ID, PLAN_ID, 100))
    expect(repo.markTaskCompleted).toHaveBeenCalledWith(TASK_ID, TENANT_ID)
  })

  it('is a no-op for progress = 50', async () => {
    await handler.handle(new TaskProgressSetEvent(TENANT_ID, ACTOR_ID, TASK_ID, PLAN_ID, 50))
    expect(repo.markTaskCompleted).not.toHaveBeenCalled()
  })

  it('is a no-op for progress = 0', async () => {
    await handler.handle(new TaskProgressSetEvent(TENANT_ID, ACTOR_ID, TASK_ID, PLAN_ID, 0))
    expect(repo.markTaskCompleted).not.toHaveBeenCalled()
  })
})
