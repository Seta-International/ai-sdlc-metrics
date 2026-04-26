import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetPlanHandler } from './get-plan.handler'
import { GetPlanQuery } from './get-plan.query'
import { Plan } from '../../../domain/entities/plan.entity'
import { PlanContainer } from '../../../domain/value-objects/plan-container.vo'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
import type { PlanAuthorizationService } from '../../services/plan-authorization.service'
import type { IPlanRepository } from '../../../domain/repositories/plan.repository'

const TENANT_ID = 'tenant-1'
const ACTOR_ID = 'actor-1'
const PLAN_ID = 'plan-1'

function makePlan(): Plan {
  return Plan.create({
    id: PLAN_ID,
    tenantId: TENANT_ID,
    name: 'Test Plan',
    container: PlanContainer.of({ type: 'future_only' }),
    createdBy: ACTOR_ID,
    ownerActorId: ACTOR_ID,
  })
}

describe('GetPlanHandler', () => {
  let handler: GetPlanHandler
  let planRepo: { findById: ReturnType<typeof vi.fn> }
  let authSvc: { assertCanReadPlan: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    planRepo = { findById: vi.fn() }
    authSvc = { assertCanReadPlan: vi.fn().mockResolvedValue(undefined) }
    handler = new GetPlanHandler(
      planRepo as unknown as IPlanRepository,
      authSvc as unknown as PlanAuthorizationService,
    )
  })

  it('returns a PlanDetail DTO when actor is authorized', async () => {
    planRepo.findById.mockResolvedValue(makePlan())

    const result = await handler.execute(new GetPlanQuery(ACTOR_ID, PLAN_ID, TENANT_ID))

    expect(result).not.toBeNull()
    expect(result!.id).toBe(PLAN_ID)
    expect(result!.name).toBe('Test Plan')
    expect(result!.members).toHaveLength(1)
    expect(result!.members[0].actorId).toBe(ACTOR_ID)
    expect(result!.members[0].role).toBe('owner')
    expect(result!.labels).toHaveLength(0)
  })

  it('calls assertCanReadPlan before findById', async () => {
    const callOrder: string[] = []
    authSvc.assertCanReadPlan.mockImplementation(async () => {
      callOrder.push('auth')
    })
    planRepo.findById.mockImplementation(async () => {
      callOrder.push('findById')
      return makePlan()
    })

    await handler.execute(new GetPlanQuery(ACTOR_ID, PLAN_ID, TENANT_ID))

    expect(callOrder).toEqual(['auth', 'findById'])
  })

  it('returns null when plan is not found', async () => {
    authSvc.assertCanReadPlan.mockResolvedValue(undefined)
    planRepo.findById.mockResolvedValue(null)

    const result = await handler.execute(new GetPlanQuery(ACTOR_ID, PLAN_ID, TENANT_ID))

    expect(result).toBeNull()
  })

  it('throws UnauthorizedPlanAccessException when actor is not authorized', async () => {
    authSvc.assertCanReadPlan.mockRejectedValue(
      new UnauthorizedPlanAccessException(ACTOR_ID, PLAN_ID),
    )

    await expect(handler.execute(new GetPlanQuery(ACTOR_ID, PLAN_ID, TENANT_ID))).rejects.toThrow(
      UnauthorizedPlanAccessException,
    )
    expect(planRepo.findById).not.toHaveBeenCalled()
  })

  it('calls findById with correct planId and tenantId', async () => {
    planRepo.findById.mockResolvedValue(makePlan())

    await handler.execute(new GetPlanQuery(ACTOR_ID, PLAN_ID, TENANT_ID))

    expect(planRepo.findById).toHaveBeenCalledWith(PLAN_ID, TENANT_ID)
  })

  it('calls assertCanReadPlan with correct actorId, planId, tenantId', async () => {
    planRepo.findById.mockResolvedValue(makePlan())

    await handler.execute(new GetPlanQuery(ACTOR_ID, PLAN_ID, TENANT_ID))

    expect(authSvc.assertCanReadPlan).toHaveBeenCalledWith(ACTOR_ID, PLAN_ID, TENANT_ID)
  })
})
