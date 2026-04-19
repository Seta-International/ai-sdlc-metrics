import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { UpdateChecklistItemHandler } from './update-checklist-item.handler'
import { UpdateChecklistItemCommand } from './update-checklist-item.command'
import { Task } from '../../../domain/entities/task.entity'
import { ChecklistItem } from '../../../domain/entities/checklist-item.value-object'
import { ChecklistItemUpdatedEvent } from '@future/event-contracts'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
import { ConcurrentModificationException } from '../../../domain/exceptions/concurrent-modification.exception'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import type { ITaskRepository } from '../../../domain/repositories/task.repository'
import type { IChecklistItemRepository } from '../../../domain/repositories/checklist-item.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const TASK_ID = 'task-1'
const ITEM_ID = 'item-1'
const ACTOR_ID = 'actor-1'

function makeTask(): Task {
  const task = Task.create({
    id: TASK_ID,
    tenantId: TENANT_ID,
    planId: PLAN_ID,
    bucketId: 'bucket-1',
    title: 'Task',
    orderHint: ' !',
    createdBy: ACTOR_ID,
  })
  task.addChecklistItem(ChecklistItem.create({ id: ITEM_ID, title: 'Old title', orderHint: ' !' }))
  return task
}

describe('UpdateChecklistItemHandler', () => {
  let handler: UpdateChecklistItemHandler
  let taskRepo: { findById: ReturnType<typeof vi.fn> }
  let checklistRepo: { updateItem: ReturnType<typeof vi.fn> }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    const task = makeTask()
    taskRepo = {
      findById: vi.fn().mockResolvedValue(task),
    }
    checklistRepo = {
      updateItem: vi.fn().mockResolvedValue(undefined),
    }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new UpdateChecklistItemHandler(
      taskRepo as unknown as ITaskRepository,
      checklistRepo as unknown as IChecklistItemRepository,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('updates checklist item title and emits ChecklistItemUpdatedEvent', async () => {
    const task = makeTask()
    taskRepo.findById.mockResolvedValue(task)
    const expectedVersion = task.updatedAt.toISOString()
    const command = new UpdateChecklistItemCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ITEM_ID,
      ACTOR_ID,
      expectedVersion,
      'New title',
    )

    await handler.execute(command)

    expect(authSvc.assertCanEditPlan).toHaveBeenCalledWith(ACTOR_ID, PLAN_ID, TENANT_ID)
    expect(checklistRepo.updateItem).toHaveBeenCalledWith(
      TASK_ID,
      TENANT_ID,
      ITEM_ID,
      'New title',
      expectedVersion,
    )
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(ChecklistItemUpdatedEvent))
    const event: ChecklistItemUpdatedEvent = eventBus.publish.mock.calls[0][0]
    expect(event.itemId).toBe(ITEM_ID)
    expect(event.title).toBe('New title')
  })

  it('throws UnauthorizedPlanAccessException when actor lacks edit permission', async () => {
    authSvc.assertCanEditPlan.mockRejectedValue(
      new UnauthorizedPlanAccessException(ACTOR_ID, PLAN_ID),
    )
    const task = makeTask()
    taskRepo.findById.mockResolvedValue(task)
    const command = new UpdateChecklistItemCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ITEM_ID,
      ACTOR_ID,
      task.updatedAt.toISOString(),
      'Not allowed',
    )

    await expect(handler.execute(command)).rejects.toThrow(UnauthorizedPlanAccessException)
    expect(checklistRepo.updateItem).not.toHaveBeenCalled()
    expect(eventBus.publish).not.toHaveBeenCalled()
  })

  it('throws ConcurrentModificationException when task version has changed', async () => {
    const task = makeTask()
    taskRepo.findById.mockResolvedValue(task)
    vi.spyOn(checklistRepo, 'updateItem').mockRejectedValueOnce(
      new ConcurrentModificationException(),
    )
    const command = new UpdateChecklistItemCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ITEM_ID,
      ACTOR_ID,
      'stale-version',
      'New title',
    )

    await expect(handler.execute(command)).rejects.toThrow(ConcurrentModificationException)
    expect(eventBus.publish).not.toHaveBeenCalled()
  })

  it('throws TaskNotFoundException when task does not exist', async () => {
    taskRepo.findById.mockResolvedValue(null)
    const command = new UpdateChecklistItemCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ITEM_ID,
      ACTOR_ID,
      'version',
      'New title',
    )

    await expect(handler.execute(command)).rejects.toThrow(TaskNotFoundException)
    expect(checklistRepo.updateItem).not.toHaveBeenCalled()
    expect(eventBus.publish).not.toHaveBeenCalled()
  })
})
