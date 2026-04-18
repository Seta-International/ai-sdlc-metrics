import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { RenamePlanLabelHandler } from './rename-plan-label.handler'
import { RenamePlanLabelCommand } from './rename-plan-label.command'
import { Plan } from '../../../domain/entities/plan.entity'
import { PlanContainer } from '../../../domain/value-objects/plan-container.vo'
import { LabelSlot } from '../../../domain/value-objects/label-slot.vo'
import { PlanLabelUpdatedEvent } from '@future/event-contracts'
import { PlanNotFoundException } from '../../../domain/exceptions/plan-not-found.exception'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const ACTOR_ID = 'actor-1'
const SLOT = LabelSlot.of('category1')

function makePlan() {
  return Plan.create({
    id: PLAN_ID,
    tenantId: TENANT_ID,
    name: 'Test Plan',
    container: PlanContainer.of({ type: 'none' }),
    createdBy: ACTOR_ID,
    ownerActorId: ACTOR_ID,
  })
}

function makePlanWithLabel() {
  const plan = makePlan()
  plan.recolorLabel(SLOT, 'Old Label', '#FF0000')
  return plan
}

describe('RenamePlanLabelHandler', () => {
  let handler: RenamePlanLabelHandler
  let planRepo: { findById: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    planRepo = {
      findById: vi.fn().mockResolvedValue(makePlan()),
      save: vi.fn().mockResolvedValue(undefined),
    }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new RenamePlanLabelHandler(
      planRepo as any,
      authSvc as any,
      eventBus as unknown as EventBus,
    )
  })

  it('renames label using default color when label does not exist yet', async () => {
    await handler.execute(
      new RenamePlanLabelCommand(TENANT_ID, PLAN_ID, ACTOR_ID, SLOT, 'New Label'),
    )

    expect(planRepo.save).toHaveBeenCalledOnce()
    const saved = planRepo.save.mock.calls[0][0] as Plan
    const label = saved.labels.find((l) => l.slot.value === SLOT.value)
    expect(label).toBeDefined()
    expect(label!.name).toBe('New Label')
    expect(label!.color).toBe('#6B7280')
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(PlanLabelUpdatedEvent))
  })

  it('preserves existing color when renaming a label that already exists', async () => {
    planRepo.findById.mockResolvedValue(makePlanWithLabel())

    await handler.execute(new RenamePlanLabelCommand(TENANT_ID, PLAN_ID, ACTOR_ID, SLOT, 'Renamed'))

    const saved = planRepo.save.mock.calls[0][0] as Plan
    const label = saved.labels.find((l) => l.slot.value === SLOT.value)
    expect(label!.name).toBe('Renamed')
    expect(label!.color).toBe('#FF0000')
  })

  it('calls authorization BEFORE mutation', async () => {
    const callOrder: string[] = []
    authSvc.assertCanEditPlan.mockImplementation(async () => {
      callOrder.push('auth')
    })
    planRepo.save.mockImplementation(async () => {
      callOrder.push('save')
    })

    await handler.execute(new RenamePlanLabelCommand(TENANT_ID, PLAN_ID, ACTOR_ID, SLOT, 'New'))

    expect(callOrder).toEqual(['auth', 'save'])
  })

  it('throws PlanNotFoundException when plan not found', async () => {
    planRepo.findById.mockResolvedValue(null)

    await expect(
      handler.execute(new RenamePlanLabelCommand(TENANT_ID, PLAN_ID, ACTOR_ID, SLOT, 'New')),
    ).rejects.toThrow(PlanNotFoundException)
    expect(planRepo.save).not.toHaveBeenCalled()
  })

  it('throws when authorization fails', async () => {
    authSvc.assertCanEditPlan.mockRejectedValue(
      new UnauthorizedPlanAccessException(ACTOR_ID, PLAN_ID),
    )

    await expect(
      handler.execute(new RenamePlanLabelCommand(TENANT_ID, PLAN_ID, ACTOR_ID, SLOT, 'New')),
    ).rejects.toThrow(UnauthorizedPlanAccessException)
    expect(planRepo.save).not.toHaveBeenCalled()
  })
})
