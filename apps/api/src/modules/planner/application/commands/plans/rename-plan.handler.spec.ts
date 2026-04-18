import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { RenamePlanHandler } from './rename-plan.handler'
import { RenamePlanCommand } from './rename-plan.command'
import { Plan } from '../../../domain/entities/plan.entity'
import { PlanContainer } from '../../../domain/value-objects/plan-container.vo'
import { PlanRenamedEvent } from '@future/event-contracts'
import { PlanNotFoundException } from '../../../domain/exceptions/plan-not-found.exception'
import { PlanConflictException } from '../../../domain/exceptions/plan-conflict.exception'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
import type { IPlanRepository } from '../../../domain/repositories/plan.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const ACTOR_ID = 'actor-1'

function makePlan() {
  return Plan.create({
    id: PLAN_ID,
    tenantId: TENANT_ID,
    name: 'Old Name',
    container: PlanContainer.of({ type: 'none' }),
    createdBy: ACTOR_ID,
    ownerActorId: ACTOR_ID,
  })
}

describe('RenamePlanHandler', () => {
  let handler: RenamePlanHandler
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
    handler = new RenamePlanHandler(
      planRepo as unknown as IPlanRepository,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('renames plan and emits PlanRenamedEvent', async () => {
    await handler.execute(new RenamePlanCommand(TENANT_ID, PLAN_ID, 'New Name', ACTOR_ID))

    expect(planRepo.save).toHaveBeenCalledOnce()
    const saved = planRepo.save.mock.calls[0][0] as Plan
    expect(saved.name).toBe('New Name')
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(PlanRenamedEvent))
    const event: PlanRenamedEvent = eventBus.publish.mock.calls[0][0]
    expect(event.planId).toBe(PLAN_ID)
    expect(event.name).toBe('New Name')
  })

  it('calls authorization BEFORE mutation', async () => {
    const callOrder: string[] = []
    authSvc.assertCanEditPlan.mockImplementation(async () => {
      callOrder.push('auth')
    })
    planRepo.save.mockImplementation(async () => {
      callOrder.push('save')
    })

    await handler.execute(new RenamePlanCommand(TENANT_ID, PLAN_ID, 'New Name', ACTOR_ID))

    expect(callOrder).toEqual(['auth', 'save'])
  })

  it('throws PlanNotFoundException when plan not found', async () => {
    planRepo.findById.mockResolvedValue(null)

    await expect(
      handler.execute(new RenamePlanCommand(TENANT_ID, PLAN_ID, 'New Name', ACTOR_ID)),
    ).rejects.toThrow(PlanNotFoundException)
    expect(planRepo.save).not.toHaveBeenCalled()
  })

  it('throws PlanConflictException when expectedVersion mismatches', async () => {
    const plan = makePlan()
    planRepo.findById.mockResolvedValue(plan)
    const wrongVersion = new Date(plan.updatedAt.getTime() - 1000)

    await expect(
      handler.execute(
        new RenamePlanCommand(TENANT_ID, PLAN_ID, 'New Name', ACTOR_ID, wrongVersion),
      ),
    ).rejects.toThrow(PlanConflictException)
    expect(planRepo.save).not.toHaveBeenCalled()
  })

  it('succeeds when expectedVersion matches plan.updatedAt', async () => {
    const plan = makePlan()
    planRepo.findById.mockResolvedValue(plan)

    await expect(
      handler.execute(
        new RenamePlanCommand(TENANT_ID, PLAN_ID, 'New Name', ACTOR_ID, plan.updatedAt),
      ),
    ).resolves.toBeUndefined()
    expect(planRepo.save).toHaveBeenCalledOnce()
  })

  it('throws when authorization fails', async () => {
    authSvc.assertCanEditPlan.mockRejectedValue(
      new UnauthorizedPlanAccessException(ACTOR_ID, PLAN_ID),
    )

    await expect(
      handler.execute(new RenamePlanCommand(TENANT_ID, PLAN_ID, 'New Name', ACTOR_ID)),
    ).rejects.toThrow(UnauthorizedPlanAccessException)
    expect(planRepo.save).not.toHaveBeenCalled()
  })
})
