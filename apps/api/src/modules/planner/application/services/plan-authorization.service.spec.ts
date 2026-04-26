import { describe, expect, it, vi, beforeEach } from 'vitest'
import { PlanAuthorizationService } from './plan-authorization.service'
import type { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import type { IPlanRepository } from '../../domain/repositories/plan.repository'
import { Plan } from '../../domain/entities/plan.entity'
import { PlanContainer } from '../../domain/value-objects/plan-container.vo'
import { UnauthorizedPlanAccessException } from '../../domain/exceptions/unauthorized-plan-access.exception'

const TENANT_ID = 'tenant-1'
const ACTOR_ID = 'actor-1'
const PLAN_ID = 'plan-1'
const OTHER_ID = 'actor-other'

function makePlan(
  ownerActorId: string,
  extraMembers: { actorId: string; role: 'owner' | 'editor' | 'viewer' }[] = [],
): Plan {
  const plan = Plan.create({
    id: PLAN_ID,
    tenantId: TENANT_ID,
    name: 'Test Plan',
    container: PlanContainer.of({ type: 'future_only' }),
    createdBy: ownerActorId,
    ownerActorId,
  })
  for (const m of extraMembers) {
    plan.addMember(m.actorId, m.role, ownerActorId)
  }
  return plan
}

describe('PlanAuthorizationService', () => {
  let kernelFacade: { canDo: ReturnType<typeof vi.fn> }
  let planRepo: { findById: ReturnType<typeof vi.fn> }
  let svc: PlanAuthorizationService

  beforeEach(() => {
    kernelFacade = { canDo: vi.fn() }
    planRepo = { findById: vi.fn() }
    svc = new PlanAuthorizationService(
      kernelFacade as unknown as KernelQueryFacade,
      planRepo as unknown as IPlanRepository,
    )
  })

  describe('assertCanCreatePlan()', () => {
    it('throws when canDo returns false', async () => {
      kernelFacade.canDo.mockResolvedValue(false)
      await expect(svc.assertCanCreatePlan(ACTOR_ID, TENANT_ID)).rejects.toThrow(
        UnauthorizedPlanAccessException,
      )
    })

    it('resolves when canDo returns true', async () => {
      kernelFacade.canDo.mockResolvedValue(true)
      await expect(svc.assertCanCreatePlan(ACTOR_ID, TENANT_ID)).resolves.toBeUndefined()
    })
  })

  describe('assertCanReadPlan()', () => {
    it('throws when not a member and read-any is false', async () => {
      planRepo.findById.mockResolvedValue(makePlan(OTHER_ID))
      kernelFacade.canDo.mockResolvedValue(false)
      await expect(svc.assertCanReadPlan(ACTOR_ID, PLAN_ID, TENANT_ID)).rejects.toThrow(
        UnauthorizedPlanAccessException,
      )
    })

    it('resolves when actor is a member (any role)', async () => {
      planRepo.findById.mockResolvedValue(makePlan(ACTOR_ID))
      await expect(svc.assertCanReadPlan(ACTOR_ID, PLAN_ID, TENANT_ID)).resolves.toBeUndefined()
    })

    it('resolves when actor is a viewer member', async () => {
      planRepo.findById.mockResolvedValue(
        makePlan(OTHER_ID, [{ actorId: ACTOR_ID, role: 'viewer' }]),
      )
      await expect(svc.assertCanReadPlan(ACTOR_ID, PLAN_ID, TENANT_ID)).resolves.toBeUndefined()
    })

    it('resolves when read-any is true and actor is not a member', async () => {
      planRepo.findById.mockResolvedValue(makePlan(OTHER_ID))
      kernelFacade.canDo.mockResolvedValue(true)
      await expect(svc.assertCanReadPlan(ACTOR_ID, PLAN_ID, TENANT_ID)).resolves.toBeUndefined()
    })

    it('throws when plan not found', async () => {
      planRepo.findById.mockResolvedValue(null)
      await expect(svc.assertCanReadPlan(ACTOR_ID, PLAN_ID, TENANT_ID)).rejects.toThrow(
        UnauthorizedPlanAccessException,
      )
    })
  })

  describe('assertCanEditPlan()', () => {
    it('resolves for owner', async () => {
      planRepo.findById.mockResolvedValue(makePlan(ACTOR_ID))
      await expect(svc.assertCanEditPlan(ACTOR_ID, PLAN_ID, TENANT_ID)).resolves.toBeUndefined()
    })

    it('resolves for editor', async () => {
      planRepo.findById.mockResolvedValue(
        makePlan(OTHER_ID, [{ actorId: ACTOR_ID, role: 'editor' }]),
      )
      await expect(svc.assertCanEditPlan(ACTOR_ID, PLAN_ID, TENANT_ID)).resolves.toBeUndefined()
    })

    it('throws for viewer', async () => {
      planRepo.findById.mockResolvedValue(
        makePlan(OTHER_ID, [{ actorId: ACTOR_ID, role: 'viewer' }]),
      )
      await expect(svc.assertCanEditPlan(ACTOR_ID, PLAN_ID, TENANT_ID)).rejects.toThrow(
        UnauthorizedPlanAccessException,
      )
    })

    it('throws when not a member', async () => {
      planRepo.findById.mockResolvedValue(makePlan(OTHER_ID))
      await expect(svc.assertCanEditPlan(ACTOR_ID, PLAN_ID, TENANT_ID)).rejects.toThrow(
        UnauthorizedPlanAccessException,
      )
    })

    it('throws when plan not found', async () => {
      planRepo.findById.mockResolvedValue(null)
      await expect(svc.assertCanEditPlan(ACTOR_ID, PLAN_ID, TENANT_ID)).rejects.toThrow(
        UnauthorizedPlanAccessException,
      )
    })
  })

  describe('assertCanAdminPlan()', () => {
    it('resolves for owner', async () => {
      planRepo.findById.mockResolvedValue(makePlan(ACTOR_ID))
      await expect(svc.assertCanAdminPlan(ACTOR_ID, PLAN_ID, TENANT_ID)).resolves.toBeUndefined()
    })

    it('throws for editor', async () => {
      planRepo.findById.mockResolvedValue(
        makePlan(OTHER_ID, [{ actorId: ACTOR_ID, role: 'editor' }]),
      )
      await expect(svc.assertCanAdminPlan(ACTOR_ID, PLAN_ID, TENANT_ID)).rejects.toThrow(
        UnauthorizedPlanAccessException,
      )
    })

    it('throws for viewer', async () => {
      planRepo.findById.mockResolvedValue(
        makePlan(OTHER_ID, [{ actorId: ACTOR_ID, role: 'viewer' }]),
      )
      await expect(svc.assertCanAdminPlan(ACTOR_ID, PLAN_ID, TENANT_ID)).rejects.toThrow(
        UnauthorizedPlanAccessException,
      )
    })

    it('throws when plan not found', async () => {
      planRepo.findById.mockResolvedValue(null)
      await expect(svc.assertCanAdminPlan(ACTOR_ID, PLAN_ID, TENANT_ID)).rejects.toThrow(
        UnauthorizedPlanAccessException,
      )
    })
  })

  describe('assertCanManageMembers()', () => {
    it('resolves for owner', async () => {
      planRepo.findById.mockResolvedValue(makePlan(ACTOR_ID))
      await expect(
        svc.assertCanManageMembers(ACTOR_ID, PLAN_ID, TENANT_ID),
      ).resolves.toBeUndefined()
    })

    it('resolves when manage-members-any permission is granted and actor is not a member', async () => {
      planRepo.findById.mockResolvedValue(makePlan(OTHER_ID))
      kernelFacade.canDo.mockResolvedValue(true)
      await expect(
        svc.assertCanManageMembers(ACTOR_ID, PLAN_ID, TENANT_ID),
      ).resolves.toBeUndefined()
    })

    it('throws for editor without manage-members-any', async () => {
      planRepo.findById.mockResolvedValue(
        makePlan(OTHER_ID, [{ actorId: ACTOR_ID, role: 'editor' }]),
      )
      kernelFacade.canDo.mockResolvedValue(false)
      await expect(svc.assertCanManageMembers(ACTOR_ID, PLAN_ID, TENANT_ID)).rejects.toThrow(
        UnauthorizedPlanAccessException,
      )
    })

    it('throws when plan not found', async () => {
      planRepo.findById.mockResolvedValue(null)
      await expect(svc.assertCanManageMembers(ACTOR_ID, PLAN_ID, TENANT_ID)).rejects.toThrow(
        UnauthorizedPlanAccessException,
      )
    })
  })
})
