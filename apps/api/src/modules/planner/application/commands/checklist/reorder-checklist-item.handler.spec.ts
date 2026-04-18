import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { ReorderChecklistItemHandler } from './reorder-checklist-item.handler'
import { ReorderChecklistItemCommand } from './reorder-checklist-item.command'
import { Task } from '../../../domain/entities/task.entity'
import { ChecklistItem } from '../../../domain/entities/checklist-item.value-object'
import { ChecklistItemReorderedEvent } from '@future/event-contracts'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
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
  task.addChecklistItem(
    ChecklistItem.create({ id: ITEM_ID, title: 'Reorderable', orderHint: ' !' }),
  )
  task.addChecklistItem(ChecklistItem.create({ id: 'item-2', title: 'Second', orderHint: ' ! !' }))
  return task
}

describe('ReorderChecklistItemHandler', () => {
  let handler: ReorderChecklistItemHandler
  let taskRepo: { findById: ReturnType<typeof vi.fn> }
  let checklistRepo: { reorderItem: ReturnType<typeof vi.fn> }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    const task = makeTask()
    taskRepo = {
      findById: vi.fn().mockResolvedValue(task),
    }
    checklistRepo = {
      reorderItem: vi.fn().mockResolvedValue(undefined),
    }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new ReorderChecklistItemHandler(
      taskRepo as unknown as ITaskRepository,
      checklistRepo as unknown as IChecklistItemRepository,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('reorders checklist item and emits ChecklistItemReorderedEvent', async () => {
    const task = makeTask()
    taskRepo.findById.mockResolvedValue(task)
    const command = new ReorderChecklistItemCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ITEM_ID,
      ACTOR_ID,
      ' !', // orderHintAfter
      ' ! !', // orderHintBefore
    )

    await handler.execute(command)

    expect(authSvc.assertCanEditPlan).toHaveBeenCalledWith(ACTOR_ID, PLAN_ID, TENANT_ID)
    expect(checklistRepo.reorderItem).toHaveBeenCalledOnce()
    const [callTaskId, callTenantId, callItemId, callOrderHint] =
      checklistRepo.reorderItem.mock.calls[0]
    expect(callTaskId).toBe(TASK_ID)
    expect(callTenantId).toBe(TENANT_ID)
    expect(callItemId).toBe(ITEM_ID)
    expect(typeof callOrderHint).toBe('string')
    expect(callOrderHint.length).toBeGreaterThan(0)
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(ChecklistItemReorderedEvent))
    const event: ChecklistItemReorderedEvent = eventBus.publish.mock.calls[0][0]
    expect(event.itemId).toBe(ITEM_ID)
    expect(event.orderHint).toBe(callOrderHint)
  })

  it('throws UnauthorizedPlanAccessException when actor lacks edit permission', async () => {
    authSvc.assertCanEditPlan.mockRejectedValue(
      new UnauthorizedPlanAccessException(ACTOR_ID, PLAN_ID),
    )
    const task = makeTask()
    taskRepo.findById.mockResolvedValue(task)
    const command = new ReorderChecklistItemCommand(TENANT_ID, PLAN_ID, TASK_ID, ITEM_ID, ACTOR_ID)

    await expect(handler.execute(command)).rejects.toThrow(UnauthorizedPlanAccessException)
    expect(checklistRepo.reorderItem).not.toHaveBeenCalled()
    expect(eventBus.publish).not.toHaveBeenCalled()
  })
})
