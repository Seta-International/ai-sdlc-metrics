import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { CreatePlanHandler } from './create-plan.handler'
import { CreatePlanCommand } from './create-plan.command'
import { PlanContainer } from '../../../domain/value-objects/plan-container.vo'
import { PlanCreatedEvent } from '@future/event-contracts'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
import type { IPlanRepository } from '../../../domain/repositories/plan.repository'
import type { IBucketRepository } from '../../../domain/repositories/bucket.repository'
import type { IPlanMemberRepository } from '../../../domain/repositories/plan-member.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const BUCKET_ID = 'bucket-1'
const ACTOR_ID = 'actor-1'

function makeCommand() {
  return new CreatePlanCommand(
    TENANT_ID,
    PLAN_ID,
    'My Plan',
    null,
    PlanContainer.of({ type: 'future_only' }),
    ACTOR_ID,
    BUCKET_ID,
  )
}

describe('CreatePlanHandler', () => {
  let handler: CreatePlanHandler
  let planRepo: { save: ReturnType<typeof vi.fn>; findById: ReturnType<typeof vi.fn> }
  let bucketRepo: { save: ReturnType<typeof vi.fn> }
  let planMemberRepo: { upsert: ReturnType<typeof vi.fn> }
  let authSvc: { assertCanCreatePlan: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    planRepo = { save: vi.fn().mockResolvedValue(undefined), findById: vi.fn() }
    bucketRepo = { save: vi.fn().mockResolvedValue(undefined) }
    planMemberRepo = { upsert: vi.fn().mockResolvedValue(undefined) }
    authSvc = { assertCanCreatePlan: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new CreatePlanHandler(
      planRepo as unknown as IPlanRepository,
      bucketRepo as unknown as IBucketRepository,
      planMemberRepo as unknown as IPlanMemberRepository,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('creates plan, seeds "To do" bucket, saves both, persists creator member, and emits PlanCreatedEvent', async () => {
    await handler.execute(makeCommand())

    expect(authSvc.assertCanCreatePlan).toHaveBeenCalledWith(ACTOR_ID, TENANT_ID)
    expect(planRepo.save).toHaveBeenCalledOnce()
    const savedPlan = planRepo.save.mock.calls[0][0]
    expect(savedPlan.id).toBe(PLAN_ID)
    expect(savedPlan.name).toBe('My Plan')
    expect(savedPlan.buckets).toHaveLength(1)
    expect(savedPlan.buckets[0].name).toBe('To do')
    expect(planMemberRepo.upsert).toHaveBeenCalledOnce()
    expect(planMemberRepo.upsert).toHaveBeenCalledWith(
      PLAN_ID,
      TENANT_ID,
      expect.objectContaining({
        actorId: ACTOR_ID,
        role: 'owner',
      }),
    )
    expect(bucketRepo.save).toHaveBeenCalledOnce()
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(PlanCreatedEvent))
    const event: PlanCreatedEvent = eventBus.publish.mock.calls[0][0]
    expect(event.planId).toBe(PLAN_ID)
    expect(event.actorId).toBe(ACTOR_ID)
    expect(event.tenantId).toBe(TENANT_ID)
    expect(event.name).toBe('My Plan')
  })

  it('calls authorization BEFORE saving', async () => {
    const callOrder: string[] = []
    authSvc.assertCanCreatePlan.mockImplementation(async () => {
      callOrder.push('auth')
    })
    planRepo.save.mockImplementation(async () => {
      callOrder.push('save')
    })

    await handler.execute(makeCommand())

    expect(callOrder).toEqual(['auth', 'save'])
  })

  it('throws when authorization fails without saving', async () => {
    authSvc.assertCanCreatePlan.mockRejectedValue(
      new UnauthorizedPlanAccessException(ACTOR_ID, 'plan'),
    )

    await expect(handler.execute(makeCommand())).rejects.toThrow(UnauthorizedPlanAccessException)
    expect(planRepo.save).not.toHaveBeenCalled()
    expect(planMemberRepo.upsert).not.toHaveBeenCalled()
    expect(bucketRepo.save).not.toHaveBeenCalled()
    expect(eventBus.publish).not.toHaveBeenCalled()
  })
})
