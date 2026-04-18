import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { SetTaskPriorityHandler } from './set-task-priority.handler'
import { SetTaskPriorityCommand } from './set-task-priority.command'
import { Task } from '../../../domain/entities/task.entity'
import { TaskUpdatedEvent } from '@future/event-contracts'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import type { ITaskRepository } from '../../../domain/repositories/task.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const BUCKET_ID = 'bucket-1'
const TASK_ID = 'task-1'
const ACTOR_ID = 'actor-1'

function makeTask() {
  return Task.create({
    id: TASK_ID,
    tenantId: TENANT_ID,
    planId: PLAN_ID,
    bucketId: BUCKET_ID,
    title: 'Task',
    orderHint: ' !',
    createdBy: ACTOR_ID,
  })
}

describe('SetTaskPriorityHandler', () => {
  let handler: SetTaskPriorityHandler
  let taskRepo: {
    findById: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    const task = makeTask()
    taskRepo = {
      findById: vi.fn().mockResolvedValue(task),
      update: vi.fn().mockResolvedValue(undefined),
    }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new SetTaskPriorityHandler(
      taskRepo as unknown as ITaskRepository,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('sets priority and emits TaskUpdatedEvent', async () => {
    const task = makeTask()
    taskRepo.findById.mockResolvedValue(task)
    const command = new SetTaskPriorityCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      task.updatedAt.toISOString(),
      1,
    )

    await handler.execute(command)

    expect(authSvc.assertCanEditPlan).toHaveBeenCalledWith(ACTOR_ID, PLAN_ID, TENANT_ID)
    const [updatedTask] = taskRepo.update.mock.calls[0]
    expect(updatedTask.priority).toBe(1)
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(TaskUpdatedEvent))
  })

  it('throws TaskNotFoundException when task not found', async () => {
    taskRepo.findById.mockResolvedValue(null)
    const command = new SetTaskPriorityCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      new Date().toISOString(),
      9,
    )

    await expect(handler.execute(command)).rejects.toThrow(TaskNotFoundException)
  })

  it('throws when auth fails', async () => {
    authSvc.assertCanEditPlan.mockRejectedValue(
      new UnauthorizedPlanAccessException(ACTOR_ID, PLAN_ID),
    )
    const task = makeTask()
    taskRepo.findById.mockResolvedValue(task)
    const command = new SetTaskPriorityCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      task.updatedAt.toISOString(),
      3,
    )

    await expect(handler.execute(command)).rejects.toThrow(UnauthorizedPlanAccessException)
    expect(taskRepo.update).not.toHaveBeenCalled()
  })
})
