import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ListPlansForActorHandler } from './list-plans-for-actor.handler'
import { ListPlansForActorQuery } from './list-plans-for-actor.query'
import { Plan } from '../../../domain/entities/plan.entity'
import { PlanContainer } from '../../../domain/value-objects/plan-container.vo'
import type { IPlanRepository } from '../../../domain/repositories/plan.repository'
import type { KernelQueryFacade } from '../../../../kernel/application/facades/kernel-query.facade'

const TENANT_ID = 'tenant-1'
const ACTOR_ID = 'actor-1'
const OTHER_ID = 'actor-other'

function makePlan(
  id: string,
  ownerActorId: string,
  extraMembers: { actorId: string; role: 'owner' | 'editor' | 'viewer' }[] = [],
): Plan {
  const plan = Plan.create({
    id,
    tenantId: TENANT_ID,
    name: `Plan ${id}`,
    container: PlanContainer.of({ type: 'none' }),
    createdBy: ownerActorId,
    ownerActorId,
  })
  for (const m of extraMembers) {
    plan.addMember(m.actorId, m.role, ownerActorId)
  }
  return plan
}

describe('ListPlansForActorHandler', () => {
  let handler: ListPlansForActorHandler
  let planRepo: { findByTenantId: ReturnType<typeof vi.fn> }
  let kernelFacade: { canDo: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    planRepo = { findByTenantId: vi.fn() }
    kernelFacade = { canDo: vi.fn() }
    handler = new ListPlansForActorHandler(
      planRepo as unknown as IPlanRepository,
      kernelFacade as unknown as KernelQueryFacade,
    )
  })

  it('returns only plans where actor is a member when read-any is false', async () => {
    const planOwned = makePlan('plan-1', ACTOR_ID)
    const planEditor = makePlan('plan-2', OTHER_ID, [{ actorId: ACTOR_ID, role: 'editor' }])
    const planViewer = makePlan('plan-3', OTHER_ID, [{ actorId: ACTOR_ID, role: 'viewer' }])
    const planNoAccess = makePlan('plan-4', OTHER_ID)

    planRepo.findByTenantId.mockResolvedValue([planOwned, planEditor, planViewer, planNoAccess])
    kernelFacade.canDo.mockResolvedValue(false)

    const result = await handler.execute(new ListPlansForActorQuery(ACTOR_ID, TENANT_ID))

    expect(result).toHaveLength(3)
    expect(result.map((p) => p.id)).toEqual(expect.arrayContaining(['plan-1', 'plan-2', 'plan-3']))
    expect(result.map((p) => p.id)).not.toContain('plan-4')
  })

  it('returns all plans when actor has read-any permission', async () => {
    const planOwned = makePlan('plan-1', ACTOR_ID)
    const planNoAccess = makePlan('plan-2', OTHER_ID)

    planRepo.findByTenantId.mockResolvedValue([planOwned, planNoAccess])
    kernelFacade.canDo.mockResolvedValue(true)

    const result = await handler.execute(new ListPlansForActorQuery(ACTOR_ID, TENANT_ID))

    expect(result).toHaveLength(2)
    expect(result.map((p) => p.id)).toEqual(expect.arrayContaining(['plan-1', 'plan-2']))
  })

  it('maps myRole correctly for members', async () => {
    const ownerPlan = makePlan('plan-1', ACTOR_ID)
    const editorPlan = makePlan('plan-2', OTHER_ID, [{ actorId: ACTOR_ID, role: 'editor' }])
    const viewerPlan = makePlan('plan-3', OTHER_ID, [{ actorId: ACTOR_ID, role: 'viewer' }])

    planRepo.findByTenantId.mockResolvedValue([ownerPlan, editorPlan, viewerPlan])
    kernelFacade.canDo.mockResolvedValue(false)

    const result = await handler.execute(new ListPlansForActorQuery(ACTOR_ID, TENANT_ID))
    const byId = Object.fromEntries(result.map((p) => [p.id, p]))

    expect(byId['plan-1'].myRole).toBe('owner')
    expect(byId['plan-2'].myRole).toBe('editor')
    expect(byId['plan-3'].myRole).toBe('viewer')
  })

  it('sets myRole to null for read-any plans the actor is not a member of', async () => {
    const planNoAccess = makePlan('plan-1', OTHER_ID)

    planRepo.findByTenantId.mockResolvedValue([planNoAccess])
    kernelFacade.canDo.mockResolvedValue(true)

    const result = await handler.execute(new ListPlansForActorQuery(ACTOR_ID, TENANT_ID))

    expect(result).toHaveLength(1)
    expect(result[0].myRole).toBeNull()
  })

  it('sets myRole to actual role even under read-any when actor is a member', async () => {
    const planEditor = makePlan('plan-1', OTHER_ID, [{ actorId: ACTOR_ID, role: 'editor' }])

    planRepo.findByTenantId.mockResolvedValue([planEditor])
    kernelFacade.canDo.mockResolvedValue(true)

    const result = await handler.execute(new ListPlansForActorQuery(ACTOR_ID, TENANT_ID))

    expect(result).toHaveLength(1)
    expect(result[0].myRole).toBe('editor')
  })

  it('maps PlanSummary shape correctly', async () => {
    const plan = makePlan('plan-1', ACTOR_ID)
    // Add one extra member so memberCount = 2
    plan.addMember('actor-viewer', 'viewer', ACTOR_ID)

    planRepo.findByTenantId.mockResolvedValue([plan])
    kernelFacade.canDo.mockResolvedValue(false)

    const result = await handler.execute(new ListPlansForActorQuery(ACTOR_ID, TENANT_ID))

    expect(result).toHaveLength(1)
    const summary = result[0]
    expect(summary.id).toBe('plan-1')
    expect(summary.name).toBe('Plan plan-1')
    expect(summary.memberCount).toBe(2)
    expect(summary.myRole).toBe('owner')
    expect(summary.updatedAt).toBeInstanceOf(Date)
  })

  it('returns empty array when tenant has no plans', async () => {
    planRepo.findByTenantId.mockResolvedValue([])
    kernelFacade.canDo.mockResolvedValue(false)

    const result = await handler.execute(new ListPlansForActorQuery(ACTOR_ID, TENANT_ID))

    expect(result).toHaveLength(0)
  })

  it('calls findByTenantId with correct tenantId', async () => {
    planRepo.findByTenantId.mockResolvedValue([])
    kernelFacade.canDo.mockResolvedValue(false)

    await handler.execute(new ListPlansForActorQuery(ACTOR_ID, TENANT_ID))

    expect(planRepo.findByTenantId).toHaveBeenCalledWith(TENANT_ID)
  })

  it('checks read-any with correct actorId and tenantId', async () => {
    planRepo.findByTenantId.mockResolvedValue([])
    kernelFacade.canDo.mockResolvedValue(false)

    await handler.execute(new ListPlansForActorQuery(ACTOR_ID, TENANT_ID))

    expect(kernelFacade.canDo).toHaveBeenCalledWith(
      ACTOR_ID,
      expect.stringContaining('planner:plan:read-any'),
      { tenantId: TENANT_ID },
    )
  })
})
