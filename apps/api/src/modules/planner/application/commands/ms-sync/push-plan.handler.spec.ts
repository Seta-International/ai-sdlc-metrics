import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Plan } from '../../../domain/entities/plan.entity'
import { PlanContainer } from '../../../domain/value-objects/plan-container.vo'
import type { IPlanRepository } from '../../../domain/repositories/plan.repository'
import type { MsGraphClient } from '../../../infrastructure/ms-graph/ms-graph-client'
import { PushPlanCommand } from './push-plan.command'
import { PushPlanHandler } from './push-plan.handler'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const MS_PLAN_ID = 'ms-plan-abc'
const MS_PLAN_ETAG = '"plan-etag-1"'
const EXTERNAL_ID = 'group-ext-1'

function makeMsGroupPlan(overrides: Partial<Parameters<typeof Plan.reconstitute>[0]> = {}): Plan {
  return Plan.reconstitute({
    id: PLAN_ID,
    tenantId: TENANT_ID,
    name: 'My Group Plan',
    description: '',
    container: PlanContainer.of({ type: 'ms_group', externalId: EXTERNAL_ID }),
    createdBy: 'actor-1',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    msPlanId: MS_PLAN_ID,
    msPlanEtag: MS_PLAN_ETAG,
    buckets: [],
    labels: [],
    members: [],
    ownerActorId: null,
    syncEnabled: true,
    ...overrides,
  })
}

function makeFutureOnlyPlan(): Plan {
  return Plan.reconstitute({
    id: PLAN_ID,
    tenantId: TENANT_ID,
    name: 'Personal Plan',
    description: '',
    container: PlanContainer.of({ type: 'future_only' }),
    createdBy: 'actor-1',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    msPlanId: null,
    msPlanEtag: null,
    buckets: [],
    labels: [],
    members: [],
    ownerActorId: 'actor-1',
    syncEnabled: false,
  })
}

describe('PushPlanHandler', () => {
  let planRepo: {
    findById: ReturnType<typeof vi.fn>
    linkToMs: ReturnType<typeof vi.fn>
  }
  let graph: {
    post: ReturnType<typeof vi.fn>
    patch: ReturnType<typeof vi.fn>
  }
  let handler: PushPlanHandler

  beforeEach(() => {
    planRepo = {
      findById: vi.fn().mockResolvedValue(makeMsGroupPlan()),
      linkToMs: vi.fn().mockResolvedValue(undefined),
    }
    graph = {
      post: vi.fn().mockResolvedValue({
        status: 201,
        body: { id: 'new-ms-plan-id', '@odata.etag': '"new-plan-etag"' },
        etag: '"new-plan-etag"',
      }),
      patch: vi.fn().mockResolvedValue({
        status: 200,
        body: { '@odata.etag': '"updated-plan-etag"' },
        etag: '"updated-plan-etag"',
      }),
    }

    handler = new PushPlanHandler(
      planRepo as unknown as IPlanRepository,
      graph as unknown as MsGraphClient,
    )
  })

  it('MS-linked plan with msPlanId → PATCHes title with If-Match and persists new ETag', async () => {
    await handler.execute(new PushPlanCommand(PLAN_ID, TENANT_ID))

    expect(graph.patch).toHaveBeenCalledOnce()
    expect(graph.patch).toHaveBeenCalledWith(
      TENANT_ID,
      `/planner/plans/${encodeURIComponent(MS_PLAN_ID)}`,
      { title: 'My Group Plan' },
      expect.objectContaining({ ifMatch: MS_PLAN_ETAG, preferReturnRepresentation: true }),
    )
    expect(graph.post).not.toHaveBeenCalled()
    expect(planRepo.linkToMs).toHaveBeenCalledOnce()
    expect(planRepo.linkToMs).toHaveBeenCalledWith(
      PLAN_ID,
      TENANT_ID,
      expect.objectContaining({
        msPlanId: MS_PLAN_ID,
        msPlanEtag: '"updated-plan-etag"',
        origin: 'ms-sync-push',
      }),
    )
  })

  it('PATCH response with no ETag → linkToMs not called', async () => {
    graph.patch.mockResolvedValue({ status: 200, body: {}, etag: null })

    await handler.execute(new PushPlanCommand(PLAN_ID, TENANT_ID))

    expect(graph.patch).toHaveBeenCalledOnce()
    expect(planRepo.linkToMs).not.toHaveBeenCalled()
  })

  it('MS-linked plan with null msPlanEtag → no-op (cannot PATCH without If-Match)', async () => {
    planRepo.findById.mockResolvedValue(makeMsGroupPlan({ msPlanEtag: null }))

    await handler.execute(new PushPlanCommand(PLAN_ID, TENANT_ID))

    expect(graph.patch).not.toHaveBeenCalled()
    expect(graph.post).not.toHaveBeenCalled()
    expect(planRepo.linkToMs).not.toHaveBeenCalled()
  })

  it('MS-linked plan without msPlanId → POSTs to create, calls linkToMs', async () => {
    planRepo.findById.mockResolvedValue(makeMsGroupPlan({ msPlanId: null, msPlanEtag: null }))

    await handler.execute(new PushPlanCommand(PLAN_ID, TENANT_ID))

    expect(graph.post).toHaveBeenCalledOnce()
    expect(graph.post).toHaveBeenCalledWith(
      TENANT_ID,
      '/planner/plans',
      expect.objectContaining({
        container: expect.objectContaining({
          containerId: EXTERNAL_ID,
          type: 'group',
        }),
        title: 'My Group Plan',
      }),
      expect.objectContaining({ preferReturnRepresentation: true }),
    )
    expect(planRepo.linkToMs).toHaveBeenCalledOnce()
    expect(planRepo.linkToMs).toHaveBeenCalledWith(
      PLAN_ID,
      TENANT_ID,
      expect.objectContaining({ msPlanId: 'new-ms-plan-id', origin: 'ms-sync-push' }),
    )
    expect(graph.patch).not.toHaveBeenCalled()
  })

  it('MS roster plan without msPlanId → POSTs with type=roster', async () => {
    planRepo.findById.mockResolvedValue(
      Plan.reconstitute({
        id: PLAN_ID,
        tenantId: TENANT_ID,
        name: 'Roster Plan',
        description: '',
        container: PlanContainer.of({ type: 'ms_roster', externalId: 'roster-ext-1' }),
        createdBy: 'actor-1',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        deletedAt: null,
        msPlanId: null,
        msPlanEtag: null,
        buckets: [],
        labels: [],
        members: [],
        ownerActorId: null,
        syncEnabled: true,
      }),
    )

    await handler.execute(new PushPlanCommand(PLAN_ID, TENANT_ID))

    expect(graph.post).toHaveBeenCalledOnce()
    const postCall = graph.post.mock.calls[0]
    expect(postCall[2]).toMatchObject({
      container: expect.objectContaining({ containerId: 'roster-ext-1', type: 'roster' }),
    })
  })

  it('future_only plan → no-op', async () => {
    planRepo.findById.mockResolvedValue(makeFutureOnlyPlan())

    await handler.execute(new PushPlanCommand(PLAN_ID, TENANT_ID))

    expect(graph.post).not.toHaveBeenCalled()
    expect(graph.patch).not.toHaveBeenCalled()
    expect(planRepo.linkToMs).not.toHaveBeenCalled()
  })

  it('plan not found → no-op', async () => {
    planRepo.findById.mockResolvedValue(null)

    await handler.execute(new PushPlanCommand(PLAN_ID, TENANT_ID))

    expect(graph.post).not.toHaveBeenCalled()
    expect(graph.patch).not.toHaveBeenCalled()
  })

  it('POST returns no id → throws', async () => {
    planRepo.findById.mockResolvedValue(makeMsGroupPlan({ msPlanId: null, msPlanEtag: null }))
    graph.post.mockResolvedValue({ status: 201, body: {}, etag: null })

    await expect(handler.execute(new PushPlanCommand(PLAN_ID, TENANT_ID))).rejects.toThrow(
      'plannerPlan create returned no id',
    )
    expect(planRepo.linkToMs).not.toHaveBeenCalled()
  })
})
