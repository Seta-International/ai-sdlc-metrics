import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { ApplyLabelHandler } from './apply-label.handler'
import { ApplyLabelCommand } from './apply-label.command'
import { Task } from '../../../domain/entities/task.entity'
import { Plan } from '../../../domain/entities/plan.entity'
import { PlanContainer } from '../../../domain/value-objects/plan-container.vo'
import { LabelSlot } from '../../../domain/value-objects/label-slot.vo'
import { TaskLabelAppliedEvent } from '@future/event-contracts'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { PlanNotFoundException } from '../../../domain/exceptions/plan-not-found.exception'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const BUCKET_ID = 'bucket-1'
const TASK_ID = 'task-1'
const ACTOR_ID = 'actor-1'

function makePlan(withLabel = false): Plan {
  const plan = Plan.create({
    id: PLAN_ID,
    tenantId: TENANT_ID,
    name: 'Test Plan',
    container: PlanContainer.of({ type: 'none' }),
    createdBy: ACTOR_ID,
    ownerActorId: ACTOR_ID,
  })
  if (withLabel) {
    plan.recolorLabel(LabelSlot.of('category1'), 'Important', '#ff0000')
  }
  return plan
}

function makeTask() {
  return Task.create({
    id: TASK_ID,
    tenantId: TENANT_ID,
    planId: PLAN_ID,
    bucketId: BUCKET_ID,
    title: 'Task',
    orderHint: ' !',
    createdBy: ACTOR_ID,
  })
}

describe('ApplyLabelHandler', () => {
  let handler: ApplyLabelHandler
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
    const task = makeTask()
    const plan = makePlan(true)
    taskRepo = {
      findById: vi.fn().mockResolvedValue(task),
      update: vi.fn().mockResolvedValue(undefined),
    }
    planRepo = {
      findById: vi.fn().mockResolvedValue(plan),
    }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new ApplyLabelHandler(
      taskRepo as any,
      planRepo as any,
      authSvc as any,
      eventBus as unknown as EventBus,
    )
  })

  it('applies label to task and emits TaskLabelAppliedEvent', async () => {
    const task = makeTask()
    taskRepo.findById.mockResolvedValue(task)
    const command = new ApplyLabelCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      task.updatedAt.toISOString(),
      'category1',
    )

    await handler.execute(command)

    expect(authSvc.assertCanEditPlan).toHaveBeenCalledWith(ACTOR_ID, PLAN_ID, TENANT_ID)
    const [updatedTask] = taskRepo.update.mock.calls[0]
    expect(updatedTask.appliedLabels.some((l: any) => l.value === 'category1')).toBe(true)
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(TaskLabelAppliedEvent))
    const event: TaskLabelAppliedEvent = eventBus.publish.mock.calls[0][0]
    expect(event.slot).toBe('category1')
  })

  it('rejects slot not defined on plan', async () => {
    const task = makeTask()
    taskRepo.findById.mockResolvedValue(task)
    // Plan has no category2 defined
    const command = new ApplyLabelCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      task.updatedAt.toISOString(),
      'category2',
    )

    await expect(handler.execute(command)).rejects.toThrow()
    expect(taskRepo.update).not.toHaveBeenCalled()
  })

  it('throws PlanNotFoundException when plan not found', async () => {
    planRepo.findById.mockResolvedValue(null)
    const task = makeTask()
    taskRepo.findById.mockResolvedValue(task)
    const command = new ApplyLabelCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      task.updatedAt.toISOString(),
      'category1',
    )

    await expect(handler.execute(command)).rejects.toThrow(PlanNotFoundException)
    expect(taskRepo.update).not.toHaveBeenCalled()
  })

  it('throws TaskNotFoundException when task not found', async () => {
    taskRepo.findById.mockResolvedValue(null)
    const command = new ApplyLabelCommand(
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
    const task = makeTask()
    taskRepo.findById.mockResolvedValue(task)
    const command = new ApplyLabelCommand(
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
