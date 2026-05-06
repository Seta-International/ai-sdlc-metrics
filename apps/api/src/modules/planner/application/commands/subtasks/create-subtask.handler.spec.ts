import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { CreateSubtaskHandler } from './create-subtask.handler'
import { CreateSubtaskCommand } from './create-subtask.command'
import { Task } from '../../../domain/entities/task.entity'
import { TaskCreatedEvent } from '@future/event-contracts'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
import type { ITaskRepository } from '../../../domain/repositories/task.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const BUCKET_ID = 'bucket-1'
const PARENT_ID = 'parent-task-1'
const ACTOR_ID = 'actor-1'

function makeParentTask(): Task {
  return Task.create({
    id: PARENT_ID,
    tenantId: TENANT_ID,
    planId: PLAN_ID,
    bucketId: BUCKET_ID,
    title: 'Parent Task',
    orderHint: '1|a:',
    createdBy: ACTOR_ID,
  })
}

describe('CreateSubtaskHandler', () => {
  let handler: CreateSubtaskHandler
  let taskRepo: {
    findById: ReturnType<typeof vi.fn>
    save: ReturnType<typeof vi.fn>
  }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    taskRepo = {
      findById: vi.fn().mockResolvedValue(makeParentTask()),
      save: vi.fn().mockResolvedValue(undefined),
    }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new CreateSubtaskHandler(
      taskRepo as unknown as ITaskRepository,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('creates subtask with parentTaskId and emits TaskCreatedEvent', async () => {
    const command = new CreateSubtaskCommand(
      TENANT_ID,
      PLAN_ID,
      BUCKET_ID,
      PARENT_ID,
      ACTOR_ID,
      'My Subtask',
    )

    const result = await handler.execute(command)

    expect(authSvc.assertCanEditPlan).toHaveBeenCalledWith(ACTOR_ID, PLAN_ID, TENANT_ID)
    expect(taskRepo.findById).toHaveBeenCalledWith(PARENT_ID, TENANT_ID)
    expect(taskRepo.save).toHaveBeenCalledOnce()

    const saved: Task = taskRepo.save.mock.calls[0][0]
    expect(saved.parentTaskId).toBe(PARENT_ID)
    expect(saved.title).toBe('My Subtask')
    expect(saved.planId).toBe(PLAN_ID)
    expect(saved.tenantId).toBe(TENANT_ID)
    expect(saved.bucketId).toBe(BUCKET_ID)
    expect(result.id).toBe(saved.id)
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(TaskCreatedEvent))
  })

  it('throws TaskNotFoundException when parent task does not exist', async () => {
    taskRepo.findById.mockResolvedValue(null)

    const command = new CreateSubtaskCommand(
      TENANT_ID,
      PLAN_ID,
      BUCKET_ID,
      PARENT_ID,
      ACTOR_ID,
      'My Subtask',
    )

    await expect(handler.execute(command)).rejects.toThrow(TaskNotFoundException)
    expect(taskRepo.save).not.toHaveBeenCalled()
  })

  it('throws when actor is not authorized', async () => {
    authSvc.assertCanEditPlan.mockRejectedValue(
      new UnauthorizedPlanAccessException(ACTOR_ID, PLAN_ID),
    )

    const command = new CreateSubtaskCommand(
      TENANT_ID,
      PLAN_ID,
      BUCKET_ID,
      PARENT_ID,
      ACTOR_ID,
      'My Subtask',
    )

    await expect(handler.execute(command)).rejects.toThrow(UnauthorizedPlanAccessException)
  })
})
