import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { AddPlanMemberHandler } from './add-plan-member.handler'
import { AddPlanMemberCommand } from './add-plan-member.command'
import { Plan } from '../../../domain/entities/plan.entity'
import { PlanContainer } from '../../../domain/value-objects/plan-container.vo'
import { PlanMemberAddedEvent } from '@future/event-contracts'
import { PlanNotFoundException } from '../../../domain/exceptions/plan-not-found.exception'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
import type { IPlanRepository } from '../../../domain/repositories/plan.repository'
import type { IPlanMemberRepository } from '../../../domain/repositories/plan-member.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const ACTOR_ID = 'actor-1'
const TARGET_ID = 'actor-2'

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

describe('AddPlanMemberHandler', () => {
  let handler: AddPlanMemberHandler
  let planRepo: { findById: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> }
  let planMemberRepo: { upsert: ReturnType<typeof vi.fn> }
  let authSvc: { assertCanManageMembers: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    planRepo = {
      findById: vi.fn().mockResolvedValue(makePlan()),
      save: vi.fn().mockResolvedValue(undefined),
    }
    planMemberRepo = { upsert: vi.fn().mockResolvedValue(undefined) }
    authSvc = { assertCanManageMembers: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new AddPlanMemberHandler(
      planRepo as unknown as IPlanRepository,
      planMemberRepo as unknown as IPlanMemberRepository,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('adds member and emits PlanMemberAddedEvent', async () => {
    await handler.execute(
      new AddPlanMemberCommand(TENANT_ID, PLAN_ID, ACTOR_ID, TARGET_ID, 'editor'),
    )

    expect(planRepo.save).toHaveBeenCalledOnce()
    const saved = planRepo.save.mock.calls[0][0] as Plan
    expect(saved.members.some((m) => m.actorId === TARGET_ID && m.role === 'editor')).toBe(true)
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(PlanMemberAddedEvent))
    const event: PlanMemberAddedEvent = eventBus.publish.mock.calls[0][0]
    expect(event.planId).toBe(PLAN_ID)
    expect(event.targetActorId).toBe(TARGET_ID)
    expect(event.role).toBe('editor')
  })

  it('calls authorization BEFORE mutation', async () => {
    const callOrder: string[] = []
    authSvc.assertCanManageMembers.mockImplementation(async () => {
      callOrder.push('auth')
    })
    planRepo.save.mockImplementation(async () => {
      callOrder.push('save')
    })

    await handler.execute(
      new AddPlanMemberCommand(TENANT_ID, PLAN_ID, ACTOR_ID, TARGET_ID, 'viewer'),
    )

    expect(callOrder).toEqual(['auth', 'save'])
  })

  it('throws PlanNotFoundException when plan not found', async () => {
    planRepo.findById.mockResolvedValue(null)

    await expect(
      handler.execute(new AddPlanMemberCommand(TENANT_ID, PLAN_ID, ACTOR_ID, TARGET_ID, 'viewer')),
    ).rejects.toThrow(PlanNotFoundException)
    expect(planRepo.save).not.toHaveBeenCalled()
  })

  it('throws when authorization fails', async () => {
    authSvc.assertCanManageMembers.mockRejectedValue(
      new UnauthorizedPlanAccessException(ACTOR_ID, PLAN_ID),
    )

    await expect(
      handler.execute(new AddPlanMemberCommand(TENANT_ID, PLAN_ID, ACTOR_ID, TARGET_ID, 'viewer')),
    ).rejects.toThrow(UnauthorizedPlanAccessException)
    expect(planRepo.save).not.toHaveBeenCalled()
  })
})
