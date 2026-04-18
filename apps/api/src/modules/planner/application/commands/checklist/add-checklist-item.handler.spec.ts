import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { AddChecklistItemHandler } from './add-checklist-item.handler'
import { AddChecklistItemCommand } from './add-checklist-item.command'
import { Task } from '../../../domain/entities/task.entity'
import { ChecklistItem } from '../../../domain/entities/checklist-item.value-object'
import { ChecklistItemAddedEvent } from '@future/event-contracts'
import { ChecklistLimitReachedException } from '../../../domain/exceptions/checklist-limit-reached.exception'
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

function makeTask(checklistItemCount = 0): Task {
  const task = Task.create({
    id: TASK_ID,
    tenantId: TENANT_ID,
    planId: PLAN_ID,
    bucketId: 'bucket-1',
    title: 'Task',
    orderHint: ' !',
    createdBy: ACTOR_ID,
  })
  // Add items to reach a given count by using addChecklistItem
  for (let i = 0; i < checklistItemCount; i++) {
    task.addChecklistItem(
      ChecklistItem.create({ id: `existing-${i}`, title: `Item ${i}`, orderHint: ` ${i}!` }),
    )
  }
  return task
}

describe('AddChecklistItemHandler', () => {
  let handler: AddChecklistItemHandler
  let taskRepo: { findById: ReturnType<typeof vi.fn> }
  let checklistRepo: { addItem: ReturnType<typeof vi.fn> }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    const task = makeTask()
    taskRepo = {
      findById: vi.fn().mockResolvedValue(task),
    }
    checklistRepo = {
      addItem: vi.fn().mockResolvedValue(undefined),
    }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new AddChecklistItemHandler(
      taskRepo as unknown as ITaskRepository,
      checklistRepo as unknown as IChecklistItemRepository,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('adds checklist item and emits ChecklistItemAddedEvent', async () => {
    const task = makeTask()
    taskRepo.findById.mockResolvedValue(task)
    const expectedVersion = task.updatedAt.toISOString()
    const command = new AddChecklistItemCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ITEM_ID,
      ACTOR_ID,
      expectedVersion,
      'Do something',
    )

    await handler.execute(command)

    expect(authSvc.assertCanEditPlan).toHaveBeenCalledWith(ACTOR_ID, PLAN_ID, TENANT_ID)
    expect(checklistRepo.addItem).toHaveBeenCalledOnce()
    const [callTaskId, callTenantId, item, callActorId, callExpectedVersion] =
      checklistRepo.addItem.mock.calls[0]
    expect(callTaskId).toBe(TASK_ID)
    expect(callTenantId).toBe(TENANT_ID)
    expect(item.id).toBe(ITEM_ID)
    expect(item.title).toBe('Do something')
    expect(callActorId).toBe(ACTOR_ID)
    expect(callExpectedVersion).toBe(expectedVersion)
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(ChecklistItemAddedEvent))
    const event: ChecklistItemAddedEvent = eventBus.publish.mock.calls[0][0]
    expect(event.itemId).toBe(ITEM_ID)
    expect(event.title).toBe('Do something')
  })

  it('throws ChecklistLimitReachedException when task already at 20 items', async () => {
    const task = makeTask(20)
    taskRepo.findById.mockResolvedValue(task)
    const command = new AddChecklistItemCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ITEM_ID,
      ACTOR_ID,
      task.updatedAt.toISOString(),
      'One too many',
    )

    await expect(handler.execute(command)).rejects.toThrow(ChecklistLimitReachedException)
    expect(checklistRepo.addItem).not.toHaveBeenCalled()
    expect(eventBus.publish).not.toHaveBeenCalled()
  })

  it('throws UnauthorizedPlanAccessException when actor lacks edit permission', async () => {
    authSvc.assertCanEditPlan.mockRejectedValue(
      new UnauthorizedPlanAccessException(ACTOR_ID, PLAN_ID),
    )
    const task = makeTask()
    taskRepo.findById.mockResolvedValue(task)
    const command = new AddChecklistItemCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ITEM_ID,
      ACTOR_ID,
      task.updatedAt.toISOString(),
      'Not allowed',
    )

    await expect(handler.execute(command)).rejects.toThrow(UnauthorizedPlanAccessException)
    expect(checklistRepo.addItem).not.toHaveBeenCalled()
    expect(eventBus.publish).not.toHaveBeenCalled()
  })

  it('throws ConcurrentModificationException when task version has changed', async () => {
    const task = makeTask()
    taskRepo.findById.mockResolvedValue(task)
    vi.spyOn(checklistRepo, 'addItem').mockRejectedValueOnce(new ConcurrentModificationException())
    const command = new AddChecklistItemCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ITEM_ID,
      ACTOR_ID,
      'stale-version',
      'Do something',
    )

    await expect(handler.execute(command)).rejects.toThrow(ConcurrentModificationException)
    expect(eventBus.publish).not.toHaveBeenCalled()
  })
})
