import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { CreateTaskHandler } from './create-task.handler'
import { CreateTaskCommand } from './create-task.command'
import { Task } from '../../../domain/entities/task.entity'
import { TaskCreatedEvent } from '@future/event-contracts'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
import type { ITaskRepository } from '../../../domain/repositories/task.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const BUCKET_ID = 'bucket-1'
const TASK_ID = 'task-1'
const ACTOR_ID = 'actor-1'

describe('CreateTaskHandler', () => {
  let handler: CreateTaskHandler
  let taskRepo: {
    findByBucketId: ReturnType<typeof vi.fn>
    save: ReturnType<typeof vi.fn>
  }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    taskRepo = {
      findByBucketId: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockResolvedValue(undefined),
    }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new CreateTaskHandler(
      taskRepo as unknown as ITaskRepository,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('creates task as top of bucket (empty bucket) and emits TaskCreatedEvent', async () => {
    const command = new CreateTaskCommand(
      TENANT_ID,
      PLAN_ID,
      BUCKET_ID,
      TASK_ID,
      'My Task',
      ACTOR_ID,
    )

    await handler.execute(command)

    expect(authSvc.assertCanEditPlan).toHaveBeenCalledWith(ACTOR_ID, PLAN_ID, TENANT_ID)
    expect(taskRepo.save).toHaveBeenCalledOnce()
    const saved: Task = taskRepo.save.mock.calls[0][0]
    expect(saved.id).toBe(TASK_ID)
    expect(saved.title).toBe('My Task')
    expect(saved.bucketId).toBe(BUCKET_ID)
    expect(saved.planId).toBe(PLAN_ID)
    expect(saved.tenantId).toBe(TENANT_ID)
    expect(saved.orderHint).toBe(' !')
    expect(saved.pendingMsAssignments).toEqual([])
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(TaskCreatedEvent))
  })

  it('places task at top when bucket has existing tasks', async () => {
    const existingTask = Task.create({
      id: 'existing-1',
      tenantId: TENANT_ID,
      planId: PLAN_ID,
      bucketId: BUCKET_ID,
      title: 'Existing',
      orderHint: '! !',
      createdBy: ACTOR_ID,
    })
    taskRepo.findByBucketId.mockResolvedValue([existingTask])

    const command = new CreateTaskCommand(
      TENANT_ID,
      PLAN_ID,
      BUCKET_ID,
      TASK_ID,
      'My Task',
      ACTOR_ID,
    )

    await handler.execute(command)

    const saved: Task = taskRepo.save.mock.calls[0][0]
    // "top of bucket" = before the minimum existing orderHint
    expect(saved.orderHint < existingTask.orderHint).toBe(true)
  })

  it('uses orderHintAfter+Before when both provided to insert between tasks', async () => {
    const command = new CreateTaskCommand(
      TENANT_ID,
      PLAN_ID,
      BUCKET_ID,
      TASK_ID,
      'New Task',
      ACTOR_ID,
      undefined,
      undefined,
      '!', // orderHintAfter
      '! !', // orderHintBefore
    )

    await handler.execute(command)

    const saved: Task = taskRepo.save.mock.calls[0][0]
    expect(saved.orderHint > '!').toBe(true)
    expect(saved.orderHint < '! !').toBe(true)
  })

  it('uses orderHintAfter alone to place task after given hint', async () => {
    const command = new CreateTaskCommand(
      TENANT_ID,
      PLAN_ID,
      BUCKET_ID,
      TASK_ID,
      'New Task',
      ACTOR_ID,
      undefined,
      undefined,
      '!', // orderHintAfter only
    )

    await handler.execute(command)

    const saved: Task = taskRepo.save.mock.calls[0][0]
    // between('!', undefined) = '! !'
    expect(saved.orderHint > '!').toBe(true)
  })

  it('uses orderHintBefore when provided', async () => {
    const command = new CreateTaskCommand(
      TENANT_ID,
      PLAN_ID,
      BUCKET_ID,
      TASK_ID,
      'New Task',
      ACTOR_ID,
      undefined,
      undefined,
      undefined,
      '! !', // orderHintBefore
    )

    await handler.execute(command)

    const saved: Task = taskRepo.save.mock.calls[0][0]
    expect(saved.orderHint < '! !').toBe(true)
  })

  it('throws when authorization fails without saving', async () => {
    authSvc.assertCanEditPlan.mockRejectedValue(
      new UnauthorizedPlanAccessException(ACTOR_ID, PLAN_ID),
    )
    const command = new CreateTaskCommand(
      TENANT_ID,
      PLAN_ID,
      BUCKET_ID,
      TASK_ID,
      'My Task',
      ACTOR_ID,
    )

    await expect(handler.execute(command)).rejects.toThrow(UnauthorizedPlanAccessException)
    expect(taskRepo.save).not.toHaveBeenCalled()
    expect(eventBus.publish).not.toHaveBeenCalled()
  })
})
