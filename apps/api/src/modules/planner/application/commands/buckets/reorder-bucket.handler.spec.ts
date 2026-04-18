import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { ReorderBucketHandler } from './reorder-bucket.handler'
import { ReorderBucketCommand } from './reorder-bucket.command'
import { Bucket } from '../../../domain/entities/bucket.entity'
import { BucketReorderedEvent } from '@future/event-contracts'
import { BucketNotFoundException } from '../../../domain/exceptions/bucket-not-found.exception'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
import type { IBucketRepository } from '../../../domain/repositories/bucket.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const BUCKET_ID = 'bucket-1'
const ACTOR_ID = 'actor-1'

function makeBucket(): Bucket {
  return Bucket.create({
    id: BUCKET_ID,
    tenantId: TENANT_ID,
    planId: PLAN_ID,
    name: 'My Bucket',
    orderHint: '!',
  })
}

describe('ReorderBucketHandler', () => {
  let handler: ReorderBucketHandler
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
    handler = new ReorderBucketHandler(
      bucketRepo as unknown as IBucketRepository,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('reorders bucket and emits BucketReorderedEvent', async () => {
    // Place after '!' and before 'a' → midpoint between them
    await handler.execute(
      new ReorderBucketCommand(TENANT_ID, PLAN_ID, BUCKET_ID, ACTOR_ID, '!', 'a'),
    )

    expect(authSvc.assertCanEditPlan).toHaveBeenCalledWith(ACTOR_ID, PLAN_ID, TENANT_ID)
    expect(bucketRepo.save).toHaveBeenCalledOnce()
    const saved: Bucket = bucketRepo.save.mock.calls[0][0]
    // MsOrderHint.between('!', 'a') → midpoint char between '!' (33) and 'a' (97) = 'A' (chr(65))
    expect(saved.orderHint).toBe('A')
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(BucketReorderedEvent))
    const event: BucketReorderedEvent = eventBus.publish.mock.calls[0][0]
    expect(event.bucketId).toBe(BUCKET_ID)
    expect(event.planId).toBe(PLAN_ID)
    expect(event.tenantId).toBe(TENANT_ID)
    expect(event.actorId).toBe(ACTOR_ID)
    expect(event.orderHint).toBe('A')
  })

  it('computes orderHint as "last" when only orderHintAfter is provided', async () => {
    await handler.execute(
      new ReorderBucketCommand(TENANT_ID, PLAN_ID, BUCKET_ID, ACTOR_ID, '!', undefined),
    )

    const saved: Bucket = bucketRepo.save.mock.calls[0][0]
    // MsOrderHint.between('!', undefined) → '! !'
    expect(saved.orderHint).toBe('! !')
  })

  it('computes orderHint as "first" when only orderHintBefore is provided', async () => {
    await handler.execute(
      new ReorderBucketCommand(TENANT_ID, PLAN_ID, BUCKET_ID, ACTOR_ID, undefined, '!'),
    )

    const saved: Bucket = bucketRepo.save.mock.calls[0][0]
    // MsOrderHint.between(undefined, '!') → ' ' (fallback since '!' is char 33, ≤ 33)
    expect(saved.orderHint).toBe(' ')
  })

  it('throws BucketNotFoundException when bucket not found', async () => {
    bucketRepo.findById.mockResolvedValue(null)

    await expect(
      handler.execute(
        new ReorderBucketCommand(TENANT_ID, PLAN_ID, BUCKET_ID, ACTOR_ID, '!', undefined),
      ),
    ).rejects.toThrow(BucketNotFoundException)
    expect(bucketRepo.save).not.toHaveBeenCalled()
  })

  it('throws when authorization fails', async () => {
    authSvc.assertCanEditPlan.mockRejectedValue(
      new UnauthorizedPlanAccessException(ACTOR_ID, PLAN_ID),
    )

    await expect(
      handler.execute(
        new ReorderBucketCommand(TENANT_ID, PLAN_ID, BUCKET_ID, ACTOR_ID, '!', undefined),
      ),
    ).rejects.toThrow(UnauthorizedPlanAccessException)
    expect(bucketRepo.save).not.toHaveBeenCalled()
  })
})
