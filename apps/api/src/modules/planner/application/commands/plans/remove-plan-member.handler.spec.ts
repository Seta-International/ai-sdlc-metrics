import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { RemovePlanMemberHandler } from './remove-plan-member.handler'
import { RemovePlanMemberCommand } from './remove-plan-member.command'
import { Plan } from '../../../domain/entities/plan.entity'
import { PlanContainer } from '../../../domain/value-objects/plan-container.vo'
import { PlanMemberRemovedEvent } from '@future/event-contracts'
import { PlanNotFoundException } from '../../../domain/exceptions/plan-not-found.exception'
import { LastOwnerRemovalException } from '../../../domain/exceptions/last-owner-removal.exception'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
import type { IPlanRepository } from '../../../domain/repositories/plan.repository'
import type { IPlanMemberRepository } from '../../../domain/repositories/plan-member.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const ACTOR_ID = 'actor-1'
const TARGET_ID = 'actor-2'

function makePlanWithTwoMembers() {
  const plan = Plan.create({
    id: PLAN_ID,
    tenantId: TENANT_ID,
    name: 'Test Plan',
    container: PlanContainer.of({ type: 'none' }),
    createdBy: ACTOR_ID,
    ownerActorId: ACTOR_ID,
  })
  plan.addMember(TARGET_ID, 'editor', ACTOR_ID)
  return plan
}

describe('RemovePlanMemberHandler', () => {
  let handler: RemovePlanMemberHandler
  let planRepo: { findById: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> }
  let planMemberRepo: { delete: ReturnType<typeof vi.fn> }
  let authSvc: { assertCanManageMembers: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    planRepo = {
      findById: vi.fn().mockResolvedValue(makePlanWithTwoMembers()),
      save: vi.fn().mockResolvedValue(undefined),
    }
    planMemberRepo = { delete: vi.fn().mockResolvedValue(undefined) }
    authSvc = { assertCanManageMembers: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new RemovePlanMemberHandler(
      planRepo as unknown as IPlanRepository,
      planMemberRepo as unknown as IPlanMemberRepository,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('removes member and emits PlanMemberRemovedEvent', async () => {
    await handler.execute(new RemovePlanMemberCommand(TENANT_ID, PLAN_ID, ACTOR_ID, TARGET_ID))

    expect(planRepo.save).toHaveBeenCalledOnce()
    const saved = planRepo.save.mock.calls[0][0] as Plan
    expect(saved.members.some((m) => m.actorId === TARGET_ID)).toBe(false)
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(PlanMemberRemovedEvent))
    const event: PlanMemberRemovedEvent = eventBus.publish.mock.calls[0][0]
    expect(event.planId).toBe(PLAN_ID)
    expect(event.targetActorId).toBe(TARGET_ID)
    expect(event.actorId).toBe(ACTOR_ID)
  })

  it('calls authorization BEFORE mutation', async () => {
    const callOrder: string[] = []
    authSvc.assertCanManageMembers.mockImplementation(async () => {
      callOrder.push('auth')
    })
    planRepo.save.mockImplementation(async () => {
      callOrder.push('save')
    })

    await handler.execute(new RemovePlanMemberCommand(TENANT_ID, PLAN_ID, ACTOR_ID, TARGET_ID))

    expect(callOrder).toEqual(['auth', 'save'])
  })

  it('throws PlanNotFoundException when plan not found', async () => {
    planRepo.findById.mockResolvedValue(null)

    await expect(
      handler.execute(new RemovePlanMemberCommand(TENANT_ID, PLAN_ID, ACTOR_ID, TARGET_ID)),
    ).rejects.toThrow(PlanNotFoundException)
    expect(planRepo.save).not.toHaveBeenCalled()
  })

  it('throws LastOwnerRemovalException when trying to remove the last owner', async () => {
    const plan = Plan.create({
      id: PLAN_ID,
      tenantId: TENANT_ID,
      name: 'Test Plan',
      container: PlanContainer.of({ type: 'none' }),
      createdBy: ACTOR_ID,
      ownerActorId: ACTOR_ID,
    })
    planRepo.findById.mockResolvedValue(plan)

    await expect(
      handler.execute(new RemovePlanMemberCommand(TENANT_ID, PLAN_ID, ACTOR_ID, ACTOR_ID)),
    ).rejects.toThrow(LastOwnerRemovalException)
    expect(planRepo.save).not.toHaveBeenCalled()
  })

  it('throws when authorization fails', async () => {
    authSvc.assertCanManageMembers.mockRejectedValue(
      new UnauthorizedPlanAccessException(ACTOR_ID, PLAN_ID),
    )

    await expect(
      handler.execute(new RemovePlanMemberCommand(TENANT_ID, PLAN_ID, ACTOR_ID, TARGET_ID)),
    ).rejects.toThrow(UnauthorizedPlanAccessException)
    expect(planRepo.save).not.toHaveBeenCalled()
  })
})
