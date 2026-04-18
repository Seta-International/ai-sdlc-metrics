import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { UpdateTaskHandler } from './update-task.handler'
import { UpdateTaskCommand } from './update-task.command'
import { Task } from '../../../domain/entities/task.entity'
import { TaskUpdatedEvent } from '@future/event-contracts'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const BUCKET_ID = 'bucket-1'
const TASK_ID = 'task-1'
const ACTOR_ID = 'actor-1'
const VIEWER_ID = 'viewer-1'

function makeTask(overrides: Partial<{ orderHint: string; assigneeIds: string[] }> = {}) {
  const task = Task.create({
    id: TASK_ID,
    tenantId: TENANT_ID,
    planId: PLAN_ID,
    bucketId: BUCKET_ID,
    title: 'Original Title',
    orderHint: overrides.orderHint ?? ' !',
    createdBy: ACTOR_ID,
  })
  if (overrides.assigneeIds) {
    for (const id of overrides.assigneeIds) {
      task.assign(id, ACTOR_ID)
    }
  }
  return task
}

describe('UpdateTaskHandler', () => {
  let handler: UpdateTaskHandler
  let taskRepo: {
    findById: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  let authSvc: {
    assertCanEditPlan: ReturnType<typeof vi.fn>
    assertCanUpdateOwnTaskProgress: ReturnType<typeof vi.fn>
  }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    const task = makeTask()
    taskRepo = {
      findById: vi.fn().mockResolvedValue(task),
      update: vi.fn().mockResolvedValue(undefined),
    }
    authSvc = {
      assertCanEditPlan: vi.fn().mockResolvedValue(undefined),
      assertCanUpdateOwnTaskProgress: vi.fn().mockResolvedValue(undefined),
    }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new UpdateTaskHandler(
      taskRepo as any,
      authSvc as any,
      eventBus as unknown as EventBus,
    )
  })

  it('updates title and emits TaskUpdatedEvent', async () => {
    const task = makeTask()
    taskRepo.findById.mockResolvedValue(task)
    const command = new UpdateTaskCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      task.updatedAt.toISOString(),
      'New Title',
    )

    await handler.execute(command)

    expect(authSvc.assertCanEditPlan).toHaveBeenCalledWith(ACTOR_ID, PLAN_ID, TENANT_ID)
    expect(taskRepo.update).toHaveBeenCalledOnce()
    const [updatedTask] = taskRepo.update.mock.calls[0]
    expect(updatedTask.title).toBe('New Title')
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(TaskUpdatedEvent))
  })

  it('uses assertCanUpdateOwnTaskProgress when only progress is being changed', async () => {
    const task = makeTask({ assigneeIds: [VIEWER_ID] })
    taskRepo.findById.mockResolvedValue(task)
    const command = new UpdateTaskCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      VIEWER_ID,
      task.updatedAt.toISOString(),
      undefined,
      undefined,
      50,
    )

    await handler.execute(command)

    expect(authSvc.assertCanUpdateOwnTaskProgress).toHaveBeenCalledWith(
      VIEWER_ID,
      PLAN_ID,
      TENANT_ID,
      expect.arrayContaining([VIEWER_ID]),
    )
    expect(authSvc.assertCanEditPlan).not.toHaveBeenCalled()
  })

  it('viewer-assignee who tries to update title is rejected via assertCanEditPlan', async () => {
    const task = makeTask({ assigneeIds: [VIEWER_ID] })
    taskRepo.findById.mockResolvedValue(task)
    authSvc.assertCanEditPlan.mockRejectedValue(
      new UnauthorizedPlanAccessException(VIEWER_ID, PLAN_ID),
    )
    const command = new UpdateTaskCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      VIEWER_ID,
      task.updatedAt.toISOString(),
      'Hacked Title',
    )

    await expect(handler.execute(command)).rejects.toThrow(UnauthorizedPlanAccessException)
    expect(taskRepo.update).not.toHaveBeenCalled()
  })

  it('throws TaskNotFoundException when task not found', async () => {
    taskRepo.findById.mockResolvedValue(null)
    const command = new UpdateTaskCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      new Date().toISOString(),
      'Title',
    )

    await expect(handler.execute(command)).rejects.toThrow(TaskNotFoundException)
    expect(taskRepo.update).not.toHaveBeenCalled()
  })

  it('throws when auth fails', async () => {
    const task = makeTask()
    taskRepo.findById.mockResolvedValue(task)
    authSvc.assertCanEditPlan.mockRejectedValue(
      new UnauthorizedPlanAccessException(ACTOR_ID, PLAN_ID),
    )
    const command = new UpdateTaskCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      task.updatedAt.toISOString(),
      'Title',
    )

    await expect(handler.execute(command)).rejects.toThrow(UnauthorizedPlanAccessException)
    expect(taskRepo.update).not.toHaveBeenCalled()
  })
})
