import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { UnassignTaskHandler } from './unassign-task.handler'
import { UnassignTaskCommand } from './unassign-task.command'
import { Task } from '../../../domain/entities/task.entity'
import { TaskUnassignedEvent } from '@future/event-contracts'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import type { ITaskRepository } from '../../../domain/repositories/task.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const BUCKET_ID = 'bucket-1'
const TASK_ID = 'task-1'
const ACTOR_ID = 'actor-1'
const ASSIGNEE_ID = 'assignee-1'

function makeTask(withAssignee = false) {
  const task = Task.create({
    id: TASK_ID,
    tenantId: TENANT_ID,
    planId: PLAN_ID,
    bucketId: BUCKET_ID,
    title: 'Task',
    orderHint: ' !',
    createdBy: ACTOR_ID,
  })
  if (withAssignee) {
    task.assign(ASSIGNEE_ID, ACTOR_ID)
  }
  return task
}

describe('UnassignTaskHandler', () => {
  let handler: UnassignTaskHandler
  let taskRepo: {
    findById: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    const task = makeTask(true)
    taskRepo = {
      findById: vi.fn().mockResolvedValue(task),
      update: vi.fn().mockResolvedValue(undefined),
    }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new UnassignTaskHandler(
      taskRepo as unknown as ITaskRepository,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('unassigns user from task and emits TaskUnassignedEvent', async () => {
    const task = makeTask(true)
    taskRepo.findById.mockResolvedValue(task)
    const command = new UnassignTaskCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      task.updatedAt.toISOString(),
      ASSIGNEE_ID,
    )

    await handler.execute(command)

    expect(authSvc.assertCanEditPlan).toHaveBeenCalledWith(ACTOR_ID, PLAN_ID, TENANT_ID)
    const [updatedTask] = taskRepo.update.mock.calls[0] as [Task, ...unknown[]]
    expect(updatedTask.assignees.some((a) => a.actorId === ASSIGNEE_ID)).toBe(false)
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(TaskUnassignedEvent))
    const event: TaskUnassignedEvent = eventBus.publish.mock.calls[0][0]
    expect(event.assigneeId).toBe(ASSIGNEE_ID)
  })

  it('is idempotent when unassigning someone not assigned', async () => {
    const task = makeTask(false)
    taskRepo.findById.mockResolvedValue(task)
    const command = new UnassignTaskCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      task.updatedAt.toISOString(),
      'not-assigned-user',
    )

    await handler.execute(command)

    // Should still call update (entity.unassign is idempotent, updatedAt may not change)
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(TaskUnassignedEvent))
  })

  it('throws TaskNotFoundException when task not found', async () => {
    taskRepo.findById.mockResolvedValue(null)
    const command = new UnassignTaskCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      new Date().toISOString(),
      ASSIGNEE_ID,
    )

    await expect(handler.execute(command)).rejects.toThrow(TaskNotFoundException)
  })

  it('throws when auth fails', async () => {
    authSvc.assertCanEditPlan.mockRejectedValue(
      new UnauthorizedPlanAccessException(ACTOR_ID, PLAN_ID),
    )
    const task = makeTask(true)
    taskRepo.findById.mockResolvedValue(task)
    const command = new UnassignTaskCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      task.updatedAt.toISOString(),
      ASSIGNEE_ID,
    )

    await expect(handler.execute(command)).rejects.toThrow(UnauthorizedPlanAccessException)
    expect(taskRepo.update).not.toHaveBeenCalled()
  })
})
