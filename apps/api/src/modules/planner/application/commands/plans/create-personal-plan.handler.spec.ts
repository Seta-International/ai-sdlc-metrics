import { beforeEach, describe, expect, it, vi } from 'vitest'
import { uuidv7 } from 'uuidv7'
import { CreatePersonalPlanHandler } from './create-personal-plan.handler'
import { CreatePersonalPlanCommand } from './create-personal-plan.command'
import type { IPlanRepository } from '../../../domain/repositories/plan.repository'
import type { IPlanMemberRepository } from '../../../domain/repositories/plan-member.repository'
import type { Plan } from '../../../domain/entities/plan.entity'

const TENANT_ID = uuidv7()
const ACTOR_ID = uuidv7()

function makePlanRepo(): IPlanRepository {
  return {
    findById: vi.fn(),
    findByTenantId: vi.fn(),
    findPersonalByOwner: vi.fn(),
    listAllIds: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
    softDelete: vi.fn(),
  }
}

function makeMemberRepo(): IPlanMemberRepository {
  return {
    findByPlanId: vi.fn(),
    upsert: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn(),
  }
}

describe('CreatePersonalPlanHandler', () => {
  let planRepo: IPlanRepository
  let memberRepo: IPlanMemberRepository
  let handler: CreatePersonalPlanHandler

  beforeEach(() => {
    planRepo = makePlanRepo()
    memberRepo = makeMemberRepo()
    handler = new CreatePersonalPlanHandler(planRepo, memberRepo)
  })

  it('creates a new personal plan when none exists and returns created=true', async () => {
    vi.mocked(planRepo.findPersonalByOwner).mockResolvedValue(null)

    const result = await handler.execute(new CreatePersonalPlanCommand(ACTOR_ID, TENANT_ID))

    expect(result.created).toBe(true)
    expect(typeof result.planId).toBe('string')
    expect(planRepo.save).toHaveBeenCalledOnce()
    expect(memberRepo.upsert).toHaveBeenCalledOnce()

    const savedPlan = vi.mocked(planRepo.save).mock.calls[0]![0] as Plan
    expect(savedPlan.isPersonal).toBe(true)
    expect(savedPlan.ownerActorId).toBe(ACTOR_ID)
    expect(savedPlan.syncEnabled).toBe(false)
    expect(savedPlan.tenantId).toBe(TENANT_ID)
    expect(savedPlan.name).toBe('Personal')
    expect(savedPlan.members).toHaveLength(1)
    expect(savedPlan.members[0]!.actorId).toBe(ACTOR_ID)
    expect(savedPlan.members[0]!.role).toBe('owner')

    // Member upsert receives the same member that was bootstrapped on the plan.
    const upsertCall = vi.mocked(memberRepo.upsert).mock.calls[0]!
    expect(upsertCall[0]).toBe(savedPlan.id)
    expect(upsertCall[1]).toBe(TENANT_ID)
    expect(upsertCall[2].actorId).toBe(ACTOR_ID)
    expect(upsertCall[2].role).toBe('owner')
  })

  it('returns existing plan id with created=false when a personal plan already exists', async () => {
    const EXISTING_ID = uuidv7()
    vi.mocked(planRepo.findPersonalByOwner).mockResolvedValue({ id: EXISTING_ID })

    const result = await handler.execute(new CreatePersonalPlanCommand(ACTOR_ID, TENANT_ID))

    expect(result).toEqual({ planId: EXISTING_ID, created: false })
    expect(planRepo.save).not.toHaveBeenCalled()
    expect(memberRepo.upsert).not.toHaveBeenCalled()
  })
})
