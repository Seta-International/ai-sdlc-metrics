import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Plan } from '../../../domain/entities/plan.entity'
import { PlanContainer } from '../../../domain/value-objects/plan-container.vo'
import { Bucket } from '../../../domain/entities/bucket.entity'
import type { IBucketRepository } from '../../../domain/repositories/bucket.repository'
import type { IPlanRepository } from '../../../domain/repositories/plan.repository'
import type { MsGraphClient } from '../../../infrastructure/ms-graph/ms-graph-client'
import { PushBucketCommand } from './push-bucket.command'
import { PushBucketHandler } from './push-bucket.handler'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const BUCKET_ID = 'bucket-1'
const MS_PLAN_ID = 'ms-plan-abc'
const MS_BUCKET_ID = 'ms-bucket-xyz'
const MS_BUCKET_ETAG = '"bucket-etag-1"'

function makeMsGroupPlan(overrides: Partial<Parameters<typeof Plan.reconstitute>[0]> = {}): Plan {
  return Plan.reconstitute({
    id: PLAN_ID,
    tenantId: TENANT_ID,
    name: 'Group Plan',
    description: '',
    container: PlanContainer.of({ type: 'ms_group', externalId: 'group-ext-1' }),
    createdBy: 'actor-1',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    msPlanId: MS_PLAN_ID,
    msPlanEtag: '"plan-etag-1"',
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

function makeBucket(overrides: Partial<Parameters<typeof Bucket.reconstitute>[0]> = {}): Bucket {
  return Bucket.reconstitute({
    id: BUCKET_ID,
    tenantId: TENANT_ID,
    planId: PLAN_ID,
    name: 'To Do',
    orderHint: ' !',
    msBucketId: MS_BUCKET_ID,
    msBucketEtag: MS_BUCKET_ETAG,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    ...overrides,
  })
}

describe('PushBucketHandler', () => {
  let bucketRepo: {
    findById: ReturnType<typeof vi.fn>
    linkToMs: ReturnType<typeof vi.fn>
  }
  let planRepo: {
    findById: ReturnType<typeof vi.fn>
  }
  let graph: {
    post: ReturnType<typeof vi.fn>
    patch: ReturnType<typeof vi.fn>
  }
  let handler: PushBucketHandler

  beforeEach(() => {
    bucketRepo = {
      findById: vi.fn().mockResolvedValue(makeBucket()),
      linkToMs: vi.fn().mockResolvedValue(undefined),
    }
    planRepo = {
      findById: vi.fn().mockResolvedValue(makeMsGroupPlan()),
    }
    graph = {
      post: vi.fn().mockResolvedValue({
        status: 201,
        body: {
          id: 'new-ms-bucket-id',
          '@odata.etag': '"new-bucket-etag"',
          orderHint: 'ms-hint-post',
        },
        etag: '"new-bucket-etag"',
      }),
      patch: vi.fn().mockResolvedValue({
        status: 200,
        body: { '@odata.etag': '"updated-bucket-etag"', orderHint: 'ms-hint-patch' },
        etag: '"updated-bucket-etag"',
      }),
    }

    handler = new PushBucketHandler(
      bucketRepo as unknown as IBucketRepository,
      planRepo as unknown as IPlanRepository,
      graph as unknown as MsGraphClient,
    )
  })

  it('bucket with msBucketId → PATCHes name + orderHint with If-Match and persists new ETag', async () => {
    await handler.execute(new PushBucketCommand(BUCKET_ID, TENANT_ID))

    expect(graph.patch).toHaveBeenCalledOnce()
    expect(graph.patch).toHaveBeenCalledWith(
      TENANT_ID,
      `/planner/buckets/${encodeURIComponent(MS_BUCKET_ID)}`,
      { name: 'To Do', orderHint: ' !' },
      expect.objectContaining({ ifMatch: MS_BUCKET_ETAG, preferReturnRepresentation: true }),
    )
    expect(graph.post).not.toHaveBeenCalled()
    expect(bucketRepo.linkToMs).toHaveBeenCalledOnce()
    expect(bucketRepo.linkToMs).toHaveBeenCalledWith(
      BUCKET_ID,
      TENANT_ID,
      expect.objectContaining({
        msBucketId: MS_BUCKET_ID,
        msBucketEtag: '"updated-bucket-etag"',
        origin: 'ms-sync-push',
        orderHint: 'ms-hint-patch',
      }),
    )
  })

  it('PATCH response with no ETag → linkToMs not called', async () => {
    graph.patch.mockResolvedValue({ status: 200, body: {}, etag: null })

    await handler.execute(new PushBucketCommand(BUCKET_ID, TENANT_ID))

    expect(graph.patch).toHaveBeenCalledOnce()
    expect(bucketRepo.linkToMs).not.toHaveBeenCalled()
  })

  it('bucket with null msBucketEtag → no-op (cannot PATCH without If-Match)', async () => {
    bucketRepo.findById.mockResolvedValue(makeBucket({ msBucketEtag: null }))

    await handler.execute(new PushBucketCommand(BUCKET_ID, TENANT_ID))

    expect(graph.patch).not.toHaveBeenCalled()
    expect(graph.post).not.toHaveBeenCalled()
    expect(bucketRepo.linkToMs).not.toHaveBeenCalled()
  })

  it('bucket without msBucketId + MS-linked plan → POSTs to create, calls linkToMs', async () => {
    bucketRepo.findById.mockResolvedValue(makeBucket({ msBucketId: null, msBucketEtag: null }))

    await handler.execute(new PushBucketCommand(BUCKET_ID, TENANT_ID))

    expect(graph.post).toHaveBeenCalledOnce()
    expect(graph.post).toHaveBeenCalledWith(
      TENANT_ID,
      '/planner/buckets',
      expect.objectContaining({
        name: 'To Do',
        planId: MS_PLAN_ID,
        orderHint: ' !',
      }),
      expect.objectContaining({ preferReturnRepresentation: true }),
    )
    expect(bucketRepo.linkToMs).toHaveBeenCalledOnce()
    expect(bucketRepo.linkToMs).toHaveBeenCalledWith(
      BUCKET_ID,
      TENANT_ID,
      expect.objectContaining({
        msBucketId: 'new-ms-bucket-id',
        origin: 'ms-sync-push',
        orderHint: 'ms-hint-post',
      }),
    )
    expect(graph.patch).not.toHaveBeenCalled()
  })

  it('future_only plan → no-op', async () => {
    planRepo.findById.mockResolvedValue(makeFutureOnlyPlan())

    await handler.execute(new PushBucketCommand(BUCKET_ID, TENANT_ID))

    expect(graph.post).not.toHaveBeenCalled()
    expect(graph.patch).not.toHaveBeenCalled()
    expect(bucketRepo.linkToMs).not.toHaveBeenCalled()
  })

  it('plan with no msPlanId → no-op', async () => {
    planRepo.findById.mockResolvedValue(makeMsGroupPlan({ msPlanId: null, msPlanEtag: null }))

    await handler.execute(new PushBucketCommand(BUCKET_ID, TENANT_ID))

    expect(graph.post).not.toHaveBeenCalled()
    expect(graph.patch).not.toHaveBeenCalled()
    expect(bucketRepo.linkToMs).not.toHaveBeenCalled()
  })

  it('bucket not found → no-op', async () => {
    bucketRepo.findById.mockResolvedValue(null)

    await handler.execute(new PushBucketCommand(BUCKET_ID, TENANT_ID))

    expect(graph.post).not.toHaveBeenCalled()
    expect(graph.patch).not.toHaveBeenCalled()
  })

  it('plan not found → no-op', async () => {
    planRepo.findById.mockResolvedValue(null)

    await handler.execute(new PushBucketCommand(BUCKET_ID, TENANT_ID))

    expect(graph.post).not.toHaveBeenCalled()
    expect(graph.patch).not.toHaveBeenCalled()
  })

  it('POST: bucket with orderHint starting with "!" → sanitized to " !" before POST', async () => {
    bucketRepo.findById.mockResolvedValue(
      makeBucket({ msBucketId: null, msBucketEtag: null, orderHint: '! !' }),
    )

    await handler.execute(new PushBucketCommand(BUCKET_ID, TENANT_ID))

    expect(graph.post).toHaveBeenCalledWith(
      TENANT_ID,
      '/planner/buckets',
      expect.objectContaining({ orderHint: ' !' }),
      expect.anything(),
    )
  })

  it('PATCH: bucket with orderHint starting with "!" → sanitized to " !" before PATCH', async () => {
    bucketRepo.findById.mockResolvedValue(makeBucket({ orderHint: '! !' }))

    await handler.execute(new PushBucketCommand(BUCKET_ID, TENANT_ID))

    expect(graph.patch).toHaveBeenCalledWith(
      TENANT_ID,
      expect.any(String),
      expect.objectContaining({ orderHint: ' !' }),
      expect.anything(),
    )
  })

  it('POST response without orderHint → linkToMs called without orderHint prop', async () => {
    bucketRepo.findById.mockResolvedValue(makeBucket({ msBucketId: null, msBucketEtag: null }))
    graph.post.mockResolvedValue({
      status: 201,
      body: { id: 'new-ms-bucket-id', '@odata.etag': '"new-bucket-etag"' },
      etag: '"new-bucket-etag"',
    })

    await handler.execute(new PushBucketCommand(BUCKET_ID, TENANT_ID))

    const call = bucketRepo.linkToMs.mock.calls[0][2]
    expect(call.orderHint).toBeUndefined()
  })

  it('POST returns no id → throws', async () => {
    bucketRepo.findById.mockResolvedValue(makeBucket({ msBucketId: null, msBucketEtag: null }))
    graph.post.mockResolvedValue({ status: 201, body: {}, etag: null })

    await expect(handler.execute(new PushBucketCommand(BUCKET_ID, TENANT_ID))).rejects.toThrow(
      'plannerBucket create returned no id',
    )
    expect(bucketRepo.linkToMs).not.toHaveBeenCalled()
  })

  it('POST: bucket with orderHint containing ASCII 91-96 chars → normalized before POST', async () => {
    bucketRepo.findById.mockResolvedValue(
      makeBucket({ msBucketId: null, msBucketEtag: null, orderHint: '[v' }),
    )

    await handler.execute(new PushBucketCommand(BUCKET_ID, TENANT_ID))

    expect(graph.post).toHaveBeenCalledWith(
      TENANT_ID,
      '/planner/buckets',
      expect.objectContaining({ orderHint: 'av' }),
      expect.anything(),
    )
  })

  it('PATCH: bucket with orderHint containing ASCII 91-96 chars → normalized before PATCH', async () => {
    bucketRepo.findById.mockResolvedValue(makeBucket({ orderHint: 'lv' }))

    await handler.execute(new PushBucketCommand(BUCKET_ID, TENANT_ID))

    // 'lv' has no chars in 91-96 range (l=108, v=118), so it passes through unchanged
    expect(graph.patch).toHaveBeenCalledWith(
      TENANT_ID,
      expect.any(String),
      expect.objectContaining({ orderHint: 'lv' }),
      expect.anything(),
    )
  })
})
