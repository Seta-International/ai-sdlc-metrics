import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { RenameBucketHandler } from './rename-bucket.handler'
import { RenameBucketCommand } from './rename-bucket.command'
import { Bucket } from '../../../domain/entities/bucket.entity'
import { BucketRenamedEvent } from '@future/event-contracts'
import { BucketNotFoundException } from '../../../domain/exceptions/bucket-not-found.exception'
import { ConcurrentModificationException } from '../../../domain/exceptions/concurrent-modification.exception'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const BUCKET_ID = 'bucket-1'
const ACTOR_ID = 'actor-1'

function makeBucket(): Bucket {
  return Bucket.create({
    id: BUCKET_ID,
    tenantId: TENANT_ID,
    planId: PLAN_ID,
    name: 'Old Name',
    orderHint: '!',
  })
}

describe('RenameBucketHandler', () => {
  let handler: RenameBucketHandler
  let bucketRepo: {
    findById: ReturnType<typeof vi.fn>
    save: ReturnType<typeof vi.fn>
  }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    bucketRepo = {
      findById: vi.fn().mockResolvedValue(makeBucket()),
      save: vi.fn().mockResolvedValue(undefined),
    }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new RenameBucketHandler(
      bucketRepo as any,
      authSvc as any,
      eventBus as unknown as EventBus,
    )
  })

  it('renames bucket and emits BucketRenamedEvent', async () => {
    await handler.execute(
      new RenameBucketCommand(TENANT_ID, PLAN_ID, BUCKET_ID, 'New Name', ACTOR_ID),
    )

    expect(bucketRepo.save).toHaveBeenCalledOnce()
    const saved: Bucket = bucketRepo.save.mock.calls[0][0]
    expect(saved.name).toBe('New Name')
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(BucketRenamedEvent))
    const event: BucketRenamedEvent = eventBus.publish.mock.calls[0][0]
    expect(event.bucketId).toBe(BUCKET_ID)
    expect(event.planId).toBe(PLAN_ID)
    expect(event.name).toBe('New Name')
    expect(event.tenantId).toBe(TENANT_ID)
    expect(event.actorId).toBe(ACTOR_ID)
  })

  it('calls authorization BEFORE mutation', async () => {
    const callOrder: string[] = []
    authSvc.assertCanEditPlan.mockImplementation(async () => {
      callOrder.push('auth')
    })
    bucketRepo.save.mockImplementation(async () => {
      callOrder.push('save')
    })

    await handler.execute(
      new RenameBucketCommand(TENANT_ID, PLAN_ID, BUCKET_ID, 'New Name', ACTOR_ID),
    )

    expect(callOrder).toEqual(['auth', 'save'])
  })

  it('throws BucketNotFoundException when bucket not found', async () => {
    bucketRepo.findById.mockResolvedValue(null)

    await expect(
      handler.execute(new RenameBucketCommand(TENANT_ID, PLAN_ID, BUCKET_ID, 'New Name', ACTOR_ID)),
    ).rejects.toThrow(BucketNotFoundException)
    expect(bucketRepo.save).not.toHaveBeenCalled()
  })

  it('throws ConcurrentModificationException when expectedVersion mismatches', async () => {
    const bucket = makeBucket()
    bucketRepo.findById.mockResolvedValue(bucket)
    const wrongVersion = new Date(bucket.updatedAt.getTime() - 1000)

    await expect(
      handler.execute(
        new RenameBucketCommand(TENANT_ID, PLAN_ID, BUCKET_ID, 'New Name', ACTOR_ID, wrongVersion),
      ),
    ).rejects.toThrow(ConcurrentModificationException)
    expect(bucketRepo.save).not.toHaveBeenCalled()
  })

  it('succeeds when expectedVersion matches bucket.updatedAt', async () => {
    const bucket = makeBucket()
    bucketRepo.findById.mockResolvedValue(bucket)

    await expect(
      handler.execute(
        new RenameBucketCommand(
          TENANT_ID,
          PLAN_ID,
          BUCKET_ID,
          'New Name',
          ACTOR_ID,
          bucket.updatedAt,
        ),
      ),
    ).resolves.toBeUndefined()
    expect(bucketRepo.save).toHaveBeenCalledOnce()
  })

  it('throws when authorization fails', async () => {
    authSvc.assertCanEditPlan.mockRejectedValue(
      new UnauthorizedPlanAccessException(ACTOR_ID, PLAN_ID),
    )

    await expect(
      handler.execute(new RenameBucketCommand(TENANT_ID, PLAN_ID, BUCKET_ID, 'New Name', ACTOR_ID)),
    ).rejects.toThrow(UnauthorizedPlanAccessException)
    expect(bucketRepo.save).not.toHaveBeenCalled()
  })
})
