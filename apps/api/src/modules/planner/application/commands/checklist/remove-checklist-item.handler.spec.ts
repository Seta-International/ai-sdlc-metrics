import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { RemoveChecklistItemHandler } from './remove-checklist-item.handler'
import { RemoveChecklistItemCommand } from './remove-checklist-item.command'
import { Task } from '../../../domain/entities/task.entity'
import { ChecklistItem } from '../../../domain/entities/checklist-item.value-object'
import { ChecklistItemRemovedEvent } from '@future/event-contracts'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
import { ConcurrentModificationException } from '../../../domain/exceptions/concurrent-modification.exception'
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
  task.addChecklistItem(ChecklistItem.create({ id: ITEM_ID, title: 'To remove', orderHint: ' !' }))
  return task
}

describe('RemoveChecklistItemHandler', () => {
  let handler: RemoveChecklistItemHandler
  let taskRepo: { findById: ReturnType<typeof vi.fn> }
  let checklistRepo: { removeItem: ReturnType<typeof vi.fn> }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    const task = makeTask()
    taskRepo = {
      findById: vi.fn().mockResolvedValue(task),
    }
    checklistRepo = {
      removeItem: vi.fn().mockResolvedValue(undefined),
    }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new RemoveChecklistItemHandler(
      taskRepo as unknown as ITaskRepository,
      checklistRepo as unknown as IChecklistItemRepository,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('removes checklist item and emits ChecklistItemRemovedEvent', async () => {
    const task = makeTask()
    taskRepo.findById.mockResolvedValue(task)
    const expectedVersion = task.updatedAt.toISOString()
    const command = new RemoveChecklistItemCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ITEM_ID,
      ACTOR_ID,
      expectedVersion,
    )

    await handler.execute(command)

    expect(authSvc.assertCanEditPlan).toHaveBeenCalledWith(ACTOR_ID, PLAN_ID, TENANT_ID)
    expect(checklistRepo.removeItem).toHaveBeenCalledWith(
      TASK_ID,
      TENANT_ID,
      ITEM_ID,
      expectedVersion,
    )
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(ChecklistItemRemovedEvent))
    const event: ChecklistItemRemovedEvent = eventBus.publish.mock.calls[0][0]
    expect(event.itemId).toBe(ITEM_ID)
  })

  it('throws UnauthorizedPlanAccessException when actor lacks edit permission', async () => {
    authSvc.assertCanEditPlan.mockRejectedValue(
      new UnauthorizedPlanAccessException(ACTOR_ID, PLAN_ID),
    )
    const task = makeTask()
    taskRepo.findById.mockResolvedValue(task)
    const command = new RemoveChecklistItemCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ITEM_ID,
      ACTOR_ID,
      task.updatedAt.toISOString(),
    )

    await expect(handler.execute(command)).rejects.toThrow(UnauthorizedPlanAccessException)
    expect(checklistRepo.removeItem).not.toHaveBeenCalled()
    expect(eventBus.publish).not.toHaveBeenCalled()
  })

  it('throws ConcurrentModificationException when task version has changed', async () => {
    const task = makeTask()
    taskRepo.findById.mockResolvedValue(task)
    vi.spyOn(checklistRepo, 'removeItem').mockRejectedValueOnce(
      new ConcurrentModificationException(),
    )
    const command = new RemoveChecklistItemCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ITEM_ID,
      ACTOR_ID,
      'stale-version',
    )

    await expect(handler.execute(command)).rejects.toThrow(ConcurrentModificationException)
    expect(eventBus.publish).not.toHaveBeenCalled()
  })
})
