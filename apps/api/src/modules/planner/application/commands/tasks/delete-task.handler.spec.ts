import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { DeleteTaskHandler } from './delete-task.handler'
import { DeleteTaskCommand } from './delete-task.command'
import { Task } from '../../../domain/entities/task.entity'
import { TaskDeletedEvent } from '@future/event-contracts'
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

describe('DeleteTaskHandler', () => {
  let handler: DeleteTaskHandler
  let taskRepo: {
    findById: ReturnType<typeof vi.fn>
    softDelete: ReturnType<typeof vi.fn>
  }
  let authSvc: { assertCanDeleteTask: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    const task = makeTask()
    taskRepo = {
      findById: vi.fn().mockResolvedValue(task),
      softDelete: vi.fn().mockResolvedValue(undefined),
    }
    authSvc = { assertCanDeleteTask: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new DeleteTaskHandler(
      taskRepo as unknown as ITaskRepository,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('soft-deletes task and emits TaskDeletedEvent', async () => {
    const task = makeTask()
    taskRepo.findById.mockResolvedValue(task)
    const command = new DeleteTaskCommand(TENANT_ID, PLAN_ID, TASK_ID, ACTOR_ID)

    await handler.execute(command)

    expect(authSvc.assertCanDeleteTask).toHaveBeenCalledWith(ACTOR_ID, PLAN_ID, TENANT_ID)
    expect(taskRepo.softDelete).toHaveBeenCalledWith(TASK_ID, TENANT_ID)
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(TaskDeletedEvent))
    const event: TaskDeletedEvent = eventBus.publish.mock.calls[0][0]
    expect(event.taskId).toBe(TASK_ID)
    expect(event.actorId).toBe(ACTOR_ID)
  })

  it('throws TaskNotFoundException when task not found', async () => {
    taskRepo.findById.mockResolvedValue(null)
    const command = new DeleteTaskCommand(TENANT_ID, PLAN_ID, TASK_ID, ACTOR_ID)

    await expect(handler.execute(command)).rejects.toThrow(TaskNotFoundException)
    expect(taskRepo.softDelete).not.toHaveBeenCalled()
  })

  it('throws when auth fails', async () => {
    authSvc.assertCanDeleteTask.mockRejectedValue(
      new UnauthorizedPlanAccessException(ACTOR_ID, PLAN_ID),
    )
    const task = makeTask()
    taskRepo.findById.mockResolvedValue(task)
    const command = new DeleteTaskCommand(TENANT_ID, PLAN_ID, TASK_ID, ACTOR_ID)

    await expect(handler.execute(command)).rejects.toThrow(UnauthorizedPlanAccessException)
    expect(taskRepo.softDelete).not.toHaveBeenCalled()
  })
})
