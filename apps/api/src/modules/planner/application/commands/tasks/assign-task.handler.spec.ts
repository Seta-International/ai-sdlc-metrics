import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { AssignTaskHandler } from './assign-task.handler'
import { AssignTaskCommand } from './assign-task.command'
import { Task } from '../../../domain/entities/task.entity'
import { TaskAssignedEvent } from '@future/event-contracts'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { AssigneeLimitReachedException } from '../../../domain/exceptions/assignee-limit-reached.exception'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const BUCKET_ID = 'bucket-1'
const TASK_ID = 'task-1'
const ACTOR_ID = 'actor-1'
const ASSIGNEE_ID = 'assignee-1'

function makeTask(assigneeCount = 0) {
  const task = Task.create({
    id: TASK_ID,
    tenantId: TENANT_ID,
    planId: PLAN_ID,
    bucketId: BUCKET_ID,
    title: 'Task',
    orderHint: ' !',
    createdBy: ACTOR_ID,
  })
  for (let i = 0; i < assigneeCount; i++) {
    task.assign(`user-${i}`, ACTOR_ID)
  }
  return task
}

describe('AssignTaskHandler', () => {
  let handler: AssignTaskHandler
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
    handler = new AssignTaskHandler(
      taskRepo as any,
      authSvc as any,
      eventBus as unknown as EventBus,
    )
  })

  it('assigns user to task and emits TaskAssignedEvent', async () => {
    const task = makeTask()
    taskRepo.findById.mockResolvedValue(task)
    const command = new AssignTaskCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      task.updatedAt.toISOString(),
      ASSIGNEE_ID,
    )

    await handler.execute(command)

    expect(authSvc.assertCanEditPlan).toHaveBeenCalledWith(ACTOR_ID, PLAN_ID, TENANT_ID)
    const [updatedTask] = taskRepo.update.mock.calls[0]
    expect(updatedTask.assignees.some((a: any) => a.actorId === ASSIGNEE_ID)).toBe(true)
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(TaskAssignedEvent))
    const event: TaskAssignedEvent = eventBus.publish.mock.calls[0][0]
    expect(event.assigneeId).toBe(ASSIGNEE_ID)
  })

  it('throws AssigneeLimitReachedException when 21st assignee is added', async () => {
    const task = makeTask(20)
    taskRepo.findById.mockResolvedValue(task)
    const command = new AssignTaskCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      task.updatedAt.toISOString(),
      'new-user',
    )

    await expect(handler.execute(command)).rejects.toThrow(AssigneeLimitReachedException)
    expect(taskRepo.update).not.toHaveBeenCalled()
  })

  it('throws TaskNotFoundException when task not found', async () => {
    taskRepo.findById.mockResolvedValue(null)
    const command = new AssignTaskCommand(
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
    const task = makeTask()
    taskRepo.findById.mockResolvedValue(task)
    const command = new AssignTaskCommand(
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
