import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RemoveFromMyDayHandler } from './remove-from-my-day.handler'
import { RemoveFromMyDayCommand } from './remove-from-my-day.command'
import type { IMyDayRepository } from '../../../domain/repositories/my-day.repository'

const TENANT_ID = 'tenant-1'
const ACTOR_ID = 'actor-1'
const TASK_ID = 'task-1'
const DATE = '2026-04-20'

describe('RemoveFromMyDayHandler', () => {
  let handler: RemoveFromMyDayHandler
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
    handler = new RemoveFromMyDayHandler(repo as unknown as IMyDayRepository)
  })

  it('calls repo.remove with the full composite key', async () => {
    await handler.execute(new RemoveFromMyDayCommand(ACTOR_ID, TENANT_ID, TASK_ID, DATE))
    expect(repo.remove).toHaveBeenCalledWith(ACTOR_ID, TASK_ID, DATE, TENANT_ID)
  })

  it('resolves without error when the row does not exist (repo swallows)', async () => {
    await expect(
      handler.execute(new RemoveFromMyDayCommand(ACTOR_ID, TENANT_ID, 'task-missing', DATE)),
    ).resolves.toBeUndefined()
  })
})
