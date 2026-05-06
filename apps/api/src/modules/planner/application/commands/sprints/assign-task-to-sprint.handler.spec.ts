import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { AssignTaskToSprintHandler } from './assign-task-to-sprint.handler'
import { AssignTaskToSprintCommand } from './assign-task-to-sprint.command'
import { Task } from '../../../domain/entities/task.entity'
import { TaskSprintAssignedEvent } from '@future/event-contracts'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import type { ISprintRepository } from '../../../domain/repositories/sprint.repository'
import type { ITaskRepository } from '../../../domain/repositories/task.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const ACTOR_ID = 'actor-1'
const TASK_ID = 'task-1'
const SPRINT_ID = 'sprint-1'
const EXPECTED_VERSION = '2026-01-01T00:00:00.000Z'

function makeTask(): Task {
  return Task.create({
    id: TASK_ID,
    tenantId: TENANT_ID,
    planId: PLAN_ID,
    bucketId: 'bucket-1',
    title: 'Task',
    orderHint: '1|a:',
    createdBy: ACTOR_ID,
  })
}

describe('AssignTaskToSprintHandler', () => {
  let handler: AssignTaskToSprintHandler
  let sprintRepo: { findById: ReturnType<typeof vi.fn> }
  let taskRepo: {
    findById: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    sprintRepo = { findById: vi.fn().mockResolvedValue(null) }
    taskRepo = {
      findById: vi.fn().mockResolvedValue(makeTask()),
      update: vi.fn().mockResolvedValue(undefined),
    }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new AssignTaskToSprintHandler(
      sprintRepo as unknown as ISprintRepository,
      taskRepo as unknown as ITaskRepository,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('assigns sprint to task and emits TaskSprintAssignedEvent', async () => {
    const command = new AssignTaskToSprintCommand(
      TENANT_ID,
      PLAN_ID,
      ACTOR_ID,
      TASK_ID,
      SPRINT_ID,
      EXPECTED_VERSION,
    )

    await handler.execute(command)

    expect(authSvc.assertCanEditPlan).toHaveBeenCalledWith(ACTOR_ID, PLAN_ID, TENANT_ID)
    expect(taskRepo.findById).toHaveBeenCalledWith(TASK_ID, TENANT_ID)
    expect(taskRepo.update).toHaveBeenCalledOnce()

    const updatedTask: Task = taskRepo.update.mock.calls[0][0]
    expect(updatedTask.sprintId).toBe(SPRINT_ID)
    expect(taskRepo.update.mock.calls[0][1]).toBe(EXPECTED_VERSION)

    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(TaskSprintAssignedEvent))
    const event: TaskSprintAssignedEvent = eventBus.publish.mock.calls[0][0]
    expect(event.sprintId).toBe(SPRINT_ID)
    expect(event.taskId).toBe(TASK_ID)
  })

  it('throws TaskNotFoundException when task does not exist', async () => {
    taskRepo.findById.mockResolvedValue(null)

    const command = new AssignTaskToSprintCommand(
      TENANT_ID,
      PLAN_ID,
      ACTOR_ID,
      TASK_ID,
      SPRINT_ID,
      EXPECTED_VERSION,
    )

    await expect(handler.execute(command)).rejects.toThrow(TaskNotFoundException)
    expect(taskRepo.update).not.toHaveBeenCalled()
  })
})
