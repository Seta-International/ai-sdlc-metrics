import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { DeletePlanHandler } from './delete-plan.handler'
import { DeletePlanCommand } from './delete-plan.command'
import { Plan } from '../../../domain/entities/plan.entity'
import { PlanContainer } from '../../../domain/value-objects/plan-container.vo'
import { PlanDeletedEvent } from '@future/event-contracts'
import { PlanNotFoundException } from '../../../domain/exceptions/plan-not-found.exception'
import { PersonalPlanDeletionForbiddenException } from '../../../domain/exceptions/personal-plan-deletion-forbidden.exception'
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
    name: 'Test Plan',
    container: PlanContainer.of({ type: 'future_only' }),
    createdBy: ACTOR_ID,
    ownerActorId: ACTOR_ID,
  })
}

describe('DeletePlanHandler', () => {
  let handler: DeletePlanHandler
  let planRepo: {
    findById: ReturnType<typeof vi.fn>
    softDelete: ReturnType<typeof vi.fn>
  }
  let authSvc: { assertCanAdminPlan: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    planRepo = {
      findById: vi.fn().mockResolvedValue(makePlan()),
      softDelete: vi.fn().mockResolvedValue(undefined),
    }
    authSvc = { assertCanAdminPlan: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new DeletePlanHandler(
      planRepo as unknown as IPlanRepository,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('soft deletes plan and emits PlanDeletedEvent', async () => {
    await handler.execute(new DeletePlanCommand(TENANT_ID, PLAN_ID, ACTOR_ID))

    expect(authSvc.assertCanAdminPlan).toHaveBeenCalledWith(ACTOR_ID, PLAN_ID, TENANT_ID)
    expect(planRepo.softDelete).toHaveBeenCalledWith(PLAN_ID, TENANT_ID)
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(PlanDeletedEvent))
    const event: PlanDeletedEvent = eventBus.publish.mock.calls[0][0]
    expect(event.planId).toBe(PLAN_ID)
    expect(event.actorId).toBe(ACTOR_ID)
    expect(event.tenantId).toBe(TENANT_ID)
  })

  it('calls authorization BEFORE deletion', async () => {
    const callOrder: string[] = []
    authSvc.assertCanAdminPlan.mockImplementation(async () => {
      callOrder.push('auth')
    })
    planRepo.softDelete.mockImplementation(async () => {
      callOrder.push('delete')
    })

    await handler.execute(new DeletePlanCommand(TENANT_ID, PLAN_ID, ACTOR_ID))

    expect(callOrder).toEqual(['auth', 'delete'])
  })

  it('throws PlanNotFoundException when plan not found', async () => {
    planRepo.findById.mockResolvedValue(null)

    await expect(
      handler.execute(new DeletePlanCommand(TENANT_ID, PLAN_ID, ACTOR_ID)),
    ).rejects.toThrow(PlanNotFoundException)
    expect(planRepo.softDelete).not.toHaveBeenCalled()
  })

  it('throws when authorization fails', async () => {
    authSvc.assertCanAdminPlan.mockRejectedValue(
      new UnauthorizedPlanAccessException(ACTOR_ID, PLAN_ID),
    )

    await expect(
      handler.execute(new DeletePlanCommand(TENANT_ID, PLAN_ID, ACTOR_ID)),
    ).rejects.toThrow(UnauthorizedPlanAccessException)
    expect(planRepo.softDelete).not.toHaveBeenCalled()
  })

  describe('when deleting a personal plan', () => {
    const OWNER_ID = 'owner-actor'
    const OTHER_ID = 'other-actor'

    function makePersonalPlan() {
      return Plan.createPersonal({
        id: PLAN_ID,
        tenantId: TENANT_ID,
        ownerActorId: OWNER_ID,
        name: 'Personal',
      })
    }

    it('rejects delete when a non-owner tries to delete a personal plan', async () => {
      planRepo.findById.mockResolvedValue(makePersonalPlan())
      await expect(
        handler.execute(new DeletePlanCommand(TENANT_ID, PLAN_ID, OTHER_ID)),
      ).rejects.toBeInstanceOf(PersonalPlanDeletionForbiddenException)
      expect(planRepo.softDelete).not.toHaveBeenCalled()
    })

    it('allows the owner to delete their personal plan', async () => {
      planRepo.findById.mockResolvedValue(makePersonalPlan())
      await handler.execute(new DeletePlanCommand(TENANT_ID, PLAN_ID, OWNER_ID))
      expect(planRepo.softDelete).toHaveBeenCalledWith(PLAN_ID, TENANT_ID)
    })
  })
})
