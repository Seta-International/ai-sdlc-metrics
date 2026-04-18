import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { RemoveLabelHandler } from './remove-label.handler'
import { RemoveLabelCommand } from './remove-label.command'
import { Task } from '../../../domain/entities/task.entity'
import { Plan } from '../../../domain/entities/plan.entity'
import { PlanContainer } from '../../../domain/value-objects/plan-container.vo'
import { LabelSlot } from '../../../domain/value-objects/label-slot.vo'
import { TaskLabelRemovedEvent } from '@future/event-contracts'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { PlanNotFoundException } from '../../../domain/exceptions/plan-not-found.exception'
import type { ITaskRepository } from '../../../domain/repositories/task.repository'
import type { IPlanRepository } from '../../../domain/repositories/plan.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const BUCKET_ID = 'bucket-1'
const TASK_ID = 'task-1'
const ACTOR_ID = 'actor-1'

function makePlan(): Plan {
  const plan = Plan.create({
    id: PLAN_ID,
    tenantId: TENANT_ID,
    name: 'Test Plan',
    container: PlanContainer.of({ type: 'none' }),
    createdBy: ACTOR_ID,
    ownerActorId: ACTOR_ID,
  })
  plan.recolorLabel(LabelSlot.of('category1'), 'Important', '#ff0000')
  return plan
}

function makeTask(withLabel = false) {
  const task = Task.create({
    id: TASK_ID,
    tenantId: TENANT_ID,
    planId: PLAN_ID,
    bucketId: BUCKET_ID,
    title: 'Task',
    orderHint: ' !',
    createdBy: ACTOR_ID,
  })
  if (withLabel) {
    task.applyLabel(LabelSlot.of('category1'))
  }
  return task
}

describe('RemoveLabelHandler', () => {
  let handler: RemoveLabelHandler
  let taskRepo: {
    findById: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  let planRepo: {
    findById: ReturnType<typeof vi.fn>
  }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    const task = makeTask(true)
    const plan = makePlan()
    taskRepo = {
      findById: vi.fn().mockResolvedValue(task),
      update: vi.fn().mockResolvedValue(undefined),
    }
    planRepo = {
      findById: vi.fn().mockResolvedValue(plan),
    }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new RemoveLabelHandler(
      taskRepo as unknown as ITaskRepository,
      planRepo as unknown as IPlanRepository,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('removes label from task and emits TaskLabelRemovedEvent', async () => {
    const task = makeTask(true)
    taskRepo.findById.mockResolvedValue(task)
    const command = new RemoveLabelCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      task.updatedAt.toISOString(),
      'category1',
    )

    await handler.execute(command)

    expect(authSvc.assertCanEditPlan).toHaveBeenCalledWith(ACTOR_ID, PLAN_ID, TENANT_ID)
    const [updatedTask] = taskRepo.update.mock.calls[0] as [Task, ...unknown[]]
    expect(updatedTask.appliedLabels.some((l) => l.value === 'category1')).toBe(false)
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(TaskLabelRemovedEvent))
    const event: TaskLabelRemovedEvent = eventBus.publish.mock.calls[0][0]
    expect(event.slot).toBe('category1')
  })

  it('rejects invalid slot value', async () => {
    const task = makeTask()
    taskRepo.findById.mockResolvedValue(task)
    const command = new RemoveLabelCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      task.updatedAt.toISOString(),
      'invalid-slot',
    )

    await expect(handler.execute(command)).rejects.toThrow()
    expect(taskRepo.update).not.toHaveBeenCalled()
  })

  it('throws PlanNotFoundException when plan not found', async () => {
    planRepo.findById.mockResolvedValue(null)
    const task = makeTask()
    taskRepo.findById.mockResolvedValue(task)
    const command = new RemoveLabelCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      task.updatedAt.toISOString(),
      'category1',
    )

    await expect(handler.execute(command)).rejects.toThrow(PlanNotFoundException)
  })

  it('throws TaskNotFoundException when task not found', async () => {
    taskRepo.findById.mockResolvedValue(null)
    const command = new RemoveLabelCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      new Date().toISOString(),
      'category1',
    )

    await expect(handler.execute(command)).rejects.toThrow(TaskNotFoundException)
  })

  it('throws when auth fails', async () => {
    authSvc.assertCanEditPlan.mockRejectedValue(
      new UnauthorizedPlanAccessException(ACTOR_ID, PLAN_ID),
    )
    const task = makeTask(true)
    taskRepo.findById.mockResolvedValue(task)
    const command = new RemoveLabelCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      task.updatedAt.toISOString(),
      'category1',
    )

    await expect(handler.execute(command)).rejects.toThrow(UnauthorizedPlanAccessException)
    expect(taskRepo.update).not.toHaveBeenCalled()
  })
})
