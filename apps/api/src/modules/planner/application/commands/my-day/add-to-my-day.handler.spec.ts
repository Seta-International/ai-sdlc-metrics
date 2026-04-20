import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { AddToMyDayHandler } from './add-to-my-day.handler'
import { AddToMyDayCommand } from './add-to-my-day.command'
import { MyDayEntry } from '../../../domain/entities/my-day-entry.entity'
import type { IMyDayRepository } from '../../../domain/repositories/my-day.repository'
import type { AdminQueryFacade } from '../../../../admin/application/facades/admin-query.facade'
import type { ITaskVisibilityService } from '../../lib/task-visibility'

const TENANT_ID = 'tenant-1'
const ACTOR_ID = 'actor-1'
const TASK_ID = 'task-1'
const TIMEZONE = 'Asia/Ho_Chi_Minh'

describe('AddToMyDayHandler', () => {
  let handler: AddToMyDayHandler
  let repo: {
    add: ReturnType<typeof vi.fn>
    findForDate: ReturnType<typeof vi.fn>
    remove: ReturnType<typeof vi.fn>
    markTaskCompleted: ReturnType<typeof vi.fn>
  }
  let adminFacade: { getTenantTimezone: ReturnType<typeof vi.fn> }
  let visibilitySvc: { canActorSeeTask: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    repo = {
      add: vi.fn().mockResolvedValue(undefined),
      findForDate: vi.fn().mockResolvedValue([]),
      remove: vi.fn().mockResolvedValue(undefined),
      markTaskCompleted: vi.fn().mockResolvedValue(undefined),
    }
    adminFacade = {
      getTenantTimezone: vi.fn().mockResolvedValue(TIMEZONE),
    }
    visibilitySvc = {
      canActorSeeTask: vi.fn().mockResolvedValue(true),
    }
    handler = new AddToMyDayHandler(
      repo as unknown as IMyDayRepository,
      adminFacade as unknown as AdminQueryFacade,
      visibilitySvc as unknown as ITaskVisibilityService,
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('adds an entry for a valid task + today', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-20T10:00:00Z'))

    const command = new AddToMyDayCommand(ACTOR_ID, TENANT_ID, TASK_ID, '2026-04-20')
    await handler.execute(command)

    expect(repo.add).toHaveBeenCalledOnce()
    const entry: MyDayEntry = repo.add.mock.calls[0][0]
    expect(entry).toBeInstanceOf(MyDayEntry)
    expect(entry.actorId).toBe(ACTOR_ID)
    expect(entry.tenantId).toBe(TENANT_ID)
    expect(entry.taskId).toBe(TASK_ID)
    expect(entry.addedDate).toBe('2026-04-20')
    expect(entry.completedAt).toBeNull()
  })

  it('rejects future dates', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-20T10:00:00Z'))

    const command = new AddToMyDayCommand(ACTOR_ID, TENANT_ID, TASK_ID, '2026-04-21')
    await expect(handler.execute(command)).rejects.toThrow(BadRequestException)
    expect(repo.add).not.toHaveBeenCalled()
  })

  it('rejects when the actor cannot see the task', async () => {
    visibilitySvc.canActorSeeTask.mockResolvedValue(false)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-20T10:00:00Z'))

    const command = new AddToMyDayCommand(ACTOR_ID, TENANT_ID, TASK_ID, '2026-04-20')
    await expect(handler.execute(command)).rejects.toThrow(ForbiddenException)
    expect(repo.add).not.toHaveBeenCalled()
  })

  it('rejects with NotFound when the task does not exist', async () => {
    visibilitySvc.canActorSeeTask.mockResolvedValue('task-not-found')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-20T10:00:00Z'))

    const command = new AddToMyDayCommand(ACTOR_ID, TENANT_ID, TASK_ID, '2026-04-20')
    await expect(handler.execute(command)).rejects.toThrow(NotFoundException)
    expect(repo.add).not.toHaveBeenCalled()
  })

  it('is idempotent — two consecutive calls both succeed', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-20T10:00:00Z'))

    const command = new AddToMyDayCommand(ACTOR_ID, TENANT_ID, TASK_ID, '2026-04-20')
    await handler.execute(command)
    await handler.execute(command)

    expect(repo.add).toHaveBeenCalledTimes(2)
  })
})
