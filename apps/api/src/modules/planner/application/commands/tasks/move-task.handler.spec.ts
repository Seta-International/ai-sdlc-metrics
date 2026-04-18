import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { MoveTaskHandler } from './move-task.handler'
import { MoveTaskCommand } from './move-task.command'
import { Task } from '../../../domain/entities/task.entity'
import { TaskMovedEvent } from '@future/event-contracts'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import type { ITaskRepository } from '../../../domain/repositories/task.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const BUCKET_A = 'bucket-a'
const BUCKET_B = 'bucket-b'
const TASK_ID = 'task-1'
const ACTOR_ID = 'actor-1'

function makeTask(bucketId = BUCKET_A, orderHint = ' !') {
  return Task.create({
    id: TASK_ID,
    tenantId: TENANT_ID,
    planId: PLAN_ID,
    bucketId,
    title: 'Task',
    orderHint,
    createdBy: ACTOR_ID,
  })
}

describe('MoveTaskHandler', () => {
  let handler: MoveTaskHandler
  let taskRepo: {
    findById: ReturnType<typeof vi.fn>
    findByBucketId: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    const task = makeTask()
    taskRepo = {
      findById: vi.fn().mockResolvedValue(task),
      findByBucketId: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue(undefined),
    }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new MoveTaskHandler(
      taskRepo as unknown as ITaskRepository,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('moves task to a different bucket (cross-bucket move) and emits TaskMovedEvent', async () => {
    const task = makeTask(BUCKET_A, '!')
    taskRepo.findById.mockResolvedValue(task)
    taskRepo.findByBucketId.mockResolvedValue([]) // bucket B is empty

    const command = new MoveTaskCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      task.updatedAt.toISOString(),
      BUCKET_B,
    )

    await handler.execute(command)

    expect(authSvc.assertCanEditPlan).toHaveBeenCalledWith(ACTOR_ID, PLAN_ID, TENANT_ID)
    expect(taskRepo.update).toHaveBeenCalledOnce()
    const [updatedTask] = taskRepo.update.mock.calls[0]
    expect(updatedTask.bucketId).toBe(BUCKET_B)
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(TaskMovedEvent))
    const event: TaskMovedEvent = eventBus.publish.mock.calls[0][0]
    expect(event.toBucketId).toBe(BUCKET_B)
    expect(event.taskId).toBe(TASK_ID)
  })

  it('reorders task within same bucket', async () => {
    const taskA = makeTask(BUCKET_A, '!')
    const taskC = makeTask(BUCKET_A, '! !')
    // We're moving the task between taskA and taskC
    const task = makeTask(BUCKET_A, '! ! !')
    taskRepo.findById.mockResolvedValue(task)
    taskRepo.findByBucketId.mockResolvedValue([taskA, taskC])

    const command = new MoveTaskCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      task.updatedAt.toISOString(),
      BUCKET_A,
      '!', // orderHintAfter
      '! !', // orderHintBefore
    )

    await handler.execute(command)

    const [updatedTask] = taskRepo.update.mock.calls[0]
    expect(updatedTask.bucketId).toBe(BUCKET_A)
    expect(updatedTask.orderHint > '!').toBe(true)
    expect(updatedTask.orderHint < '! !').toBe(true)
  })

  it('throws TaskNotFoundException when task not found', async () => {
    taskRepo.findById.mockResolvedValue(null)
    const command = new MoveTaskCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      new Date().toISOString(),
      BUCKET_B,
    )

    await expect(handler.execute(command)).rejects.toThrow(TaskNotFoundException)
    expect(taskRepo.update).not.toHaveBeenCalled()
  })

  it('throws when auth fails', async () => {
    authSvc.assertCanEditPlan.mockRejectedValue(
      new UnauthorizedPlanAccessException(ACTOR_ID, PLAN_ID),
    )
    const command = new MoveTaskCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      makeTask().updatedAt.toISOString(),
      BUCKET_B,
    )

    await expect(handler.execute(command)).rejects.toThrow(UnauthorizedPlanAccessException)
    expect(taskRepo.update).not.toHaveBeenCalled()
  })
})
