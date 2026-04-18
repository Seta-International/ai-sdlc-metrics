import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { SetTaskProgressHandler } from './set-task-progress.handler'
import { SetTaskProgressCommand } from './set-task-progress.command'
import { Task } from '../../../domain/entities/task.entity'
import {
  TaskProgressSetEvent,
  TaskCompletedEvent,
  TaskReopenedEvent,
} from '@future/event-contracts'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import type { ITaskRepository } from '../../../domain/repositories/task.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const BUCKET_ID = 'bucket-1'
const TASK_ID = 'task-1'
const ACTOR_ID = 'actor-1'
const VIEWER_ID = 'viewer-1'

function makeTask(assigneeIds: string[] = []) {
  const task = Task.create({
    id: TASK_ID,
    tenantId: TENANT_ID,
    planId: PLAN_ID,
    bucketId: BUCKET_ID,
    title: 'Task',
    orderHint: ' !',
    createdBy: ACTOR_ID,
  })
  for (const id of assigneeIds) {
    task.assign(id, ACTOR_ID)
  }
  return task
}

describe('SetTaskProgressHandler', () => {
  let handler: SetTaskProgressHandler
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
    handler = new SetTaskProgressHandler(
      taskRepo as unknown as ITaskRepository,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('sets progress to 0 and emits TaskProgressSetEvent', async () => {
    const task = makeTask()
    taskRepo.findById.mockResolvedValue(task)
    const command = new SetTaskProgressCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      task.updatedAt.toISOString(),
      0,
    )

    await handler.execute(command)

    const [updatedTask] = taskRepo.update.mock.calls[0]
    expect(updatedTask.progress).toBe(0)
    const event = eventBus.publish.mock.calls[0][0]
    expect(event).toBeInstanceOf(TaskProgressSetEvent)
  })

  it('sets progress to 50 and emits TaskProgressSetEvent', async () => {
    const task = makeTask()
    taskRepo.findById.mockResolvedValue(task)
    const command = new SetTaskProgressCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      task.updatedAt.toISOString(),
      50,
    )

    await handler.execute(command)

    const [updatedTask] = taskRepo.update.mock.calls[0]
    expect(updatedTask.progress).toBe(50)
  })

  it('sets progress to 100 and emits TaskCompletedEvent', async () => {
    const task = makeTask()
    taskRepo.findById.mockResolvedValue(task)
    const command = new SetTaskProgressCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      task.updatedAt.toISOString(),
      100,
    )

    await handler.execute(command)

    const [updatedTask] = taskRepo.update.mock.calls[0]
    expect(updatedTask.progress).toBe(100)
    const events = eventBus.publish.mock.calls.map((c: unknown[]) => c[0])
    expect(events.some((e: unknown) => e instanceof TaskCompletedEvent)).toBe(true)
  })

  it('viewer-assignee can set own task progress', async () => {
    const task = makeTask([VIEWER_ID])
    taskRepo.findById.mockResolvedValue(task)
    const command = new SetTaskProgressCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      VIEWER_ID,
      task.updatedAt.toISOString(),
      50,
    )

    await handler.execute(command)

    expect(authSvc.assertCanUpdateOwnTaskProgress).toHaveBeenCalledWith(
      VIEWER_ID,
      PLAN_ID,
      TENANT_ID,
      expect.arrayContaining([VIEWER_ID]),
    )
  })

  it('throws TaskNotFoundException when task not found', async () => {
    taskRepo.findById.mockResolvedValue(null)
    const command = new SetTaskProgressCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      new Date().toISOString(),
      50,
    )

    await expect(handler.execute(command)).rejects.toThrow(TaskNotFoundException)
  })

  it('throws when auth fails', async () => {
    const task = makeTask()
    taskRepo.findById.mockResolvedValue(task)
    authSvc.assertCanUpdateOwnTaskProgress.mockRejectedValue(
      new UnauthorizedPlanAccessException(VIEWER_ID, PLAN_ID),
    )
    const command = new SetTaskProgressCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      VIEWER_ID,
      task.updatedAt.toISOString(),
      50,
    )

    await expect(handler.execute(command)).rejects.toThrow(UnauthorizedPlanAccessException)
    expect(taskRepo.update).not.toHaveBeenCalled()
  })

  it('reopens task when progress set to < 100 on a previously completed task', async () => {
    const task = makeTask([ACTOR_ID])
    task.markCompleted(ACTOR_ID, new Date())
    taskRepo.findById.mockResolvedValue(task)
    const command = new SetTaskProgressCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      task.updatedAt.toISOString(),
      50,
    )

    await handler.execute(command)

    const [updatedTask] = taskRepo.update.mock.calls[0]
    expect(updatedTask.progress).toBe(50)
    expect(updatedTask.completedAt).toBeNull()
    const events = eventBus.publish.mock.calls.map((c: unknown[]) => c[0])
    expect(events.some((e: unknown) => e instanceof TaskReopenedEvent)).toBe(true)
  })

  it('viewer-non-assignee cannot change progress', async () => {
    const task = makeTask([ACTOR_ID])
    taskRepo.findById.mockResolvedValue(task)
    authSvc.assertCanUpdateOwnTaskProgress.mockRejectedValue(
      new UnauthorizedPlanAccessException(VIEWER_ID, PLAN_ID),
    )
    const command = new SetTaskProgressCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      VIEWER_ID,
      task.updatedAt.toISOString(),
      50,
    )

    await expect(handler.execute(command)).rejects.toThrow(UnauthorizedPlanAccessException)
    expect(taskRepo.update).not.toHaveBeenCalled()
  })
})
