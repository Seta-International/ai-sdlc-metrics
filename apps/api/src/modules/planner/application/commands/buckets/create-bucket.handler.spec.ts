import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { CreateBucketHandler } from './create-bucket.handler'
import { CreateBucketCommand } from './create-bucket.command'
import { Bucket } from '../../../domain/entities/bucket.entity'
import { BucketCreatedEvent } from '@future/event-contracts'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const BUCKET_ID = 'bucket-1'
const ACTOR_ID = 'actor-1'

function makeCommand(
  overrides: Partial<ConstructorParameters<typeof CreateBucketCommand>[0]> = {},
) {
  return new CreateBucketCommand(TENANT_ID, PLAN_ID, BUCKET_ID, 'New Bucket', ACTOR_ID)
}

function makeBucket(overrides: { id?: string; orderHint?: string } = {}): Bucket {
  return Bucket.create({
    id: overrides.id ?? 'existing-bucket-1',
    tenantId: TENANT_ID,
    planId: PLAN_ID,
    name: 'Existing Bucket',
    orderHint: overrides.orderHint ?? '!',
  })
}

describe('CreateBucketHandler', () => {
  let handler: CreateBucketHandler
  let bucketRepo: {
    findByPlanId: ReturnType<typeof vi.fn>
    save: ReturnType<typeof vi.fn>
  }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    bucketRepo = {
      findByPlanId: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockResolvedValue(undefined),
    }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new CreateBucketHandler(
      bucketRepo as any,
      authSvc as any,
      eventBus as unknown as EventBus,
    )
  })

  it('creates bucket with orderHint as "last" and emits BucketCreatedEvent', async () => {
    const existingBucket = makeBucket({ orderHint: '!' })
    bucketRepo.findByPlanId.mockResolvedValue([existingBucket])

    await handler.execute(makeCommand())

    expect(authSvc.assertCanEditPlan).toHaveBeenCalledWith(ACTOR_ID, PLAN_ID, TENANT_ID)
    expect(bucketRepo.save).toHaveBeenCalledOnce()
    const saved: Bucket = bucketRepo.save.mock.calls[0][0]
    expect(saved.id).toBe(BUCKET_ID)
    expect(saved.name).toBe('New Bucket')
    expect(saved.planId).toBe(PLAN_ID)
    expect(saved.tenantId).toBe(TENANT_ID)
    // orderHint should be after the last existing bucket
    expect(saved.orderHint).toBe('! !')
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(BucketCreatedEvent))
    const event: BucketCreatedEvent = eventBus.publish.mock.calls[0][0]
    expect(event.bucketId).toBe(BUCKET_ID)
    expect(event.planId).toBe(PLAN_ID)
    expect(event.tenantId).toBe(TENANT_ID)
    expect(event.actorId).toBe(ACTOR_ID)
    expect(event.name).toBe('New Bucket')
    expect(event.orderHint).toBe('! !')
  })

  it('uses " !" as orderHint when no existing buckets', async () => {
    bucketRepo.findByPlanId.mockResolvedValue([])

    await handler.execute(makeCommand())

    const saved: Bucket = bucketRepo.save.mock.calls[0][0]
    expect(saved.orderHint).toBe(' !')
  })

  it('calls authorization BEFORE saving', async () => {
    const callOrder: string[] = []
    authSvc.assertCanEditPlan.mockImplementation(async () => {
      callOrder.push('auth')
    })
    bucketRepo.save.mockImplementation(async () => {
      callOrder.push('save')
    })

    await handler.execute(makeCommand())

    expect(callOrder).toEqual(['auth', 'save'])
  })

  it('throws when authorization fails without saving', async () => {
    authSvc.assertCanEditPlan.mockRejectedValue(
      new UnauthorizedPlanAccessException(ACTOR_ID, PLAN_ID),
    )

    await expect(handler.execute(makeCommand())).rejects.toThrow(UnauthorizedPlanAccessException)
    expect(bucketRepo.save).not.toHaveBeenCalled()
    expect(eventBus.publish).not.toHaveBeenCalled()
  })
})
