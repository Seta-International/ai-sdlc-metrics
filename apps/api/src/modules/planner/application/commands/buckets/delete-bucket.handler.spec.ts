import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { DeleteBucketHandler } from './delete-bucket.handler'
import { DeleteBucketCommand } from './delete-bucket.command'
import { Bucket } from '../../../domain/entities/bucket.entity'
import { Task } from '../../../domain/entities/task.entity'
import { BucketDeletedEvent, TaskDeletedEvent } from '@future/event-contracts'
import { BucketNotFoundException } from '../../../domain/exceptions/bucket-not-found.exception'
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
    name: 'My Bucket',
    orderHint: '!',
  })
}

function makeTask(id: string): Task {
  return Task.create({
    id,
    tenantId: TENANT_ID,
    planId: PLAN_ID,
    bucketId: BUCKET_ID,
    title: `Task ${id}`,
    orderHint: '!',
    createdBy: ACTOR_ID,
  })
}

describe('DeleteBucketHandler', () => {
  let handler: DeleteBucketHandler
  let bucketRepo: {
    findById: ReturnType<typeof vi.fn>
    softDelete: ReturnType<typeof vi.fn>
  }
  let taskRepo: {
    softDeleteMany: ReturnType<typeof vi.fn>
  }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    bucketRepo = {
      findById: vi.fn().mockResolvedValue(makeBucket()),
      softDelete: vi.fn().mockResolvedValue(undefined),
    }
    taskRepo = {
      softDeleteMany: vi.fn().mockResolvedValue([]),
    }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new DeleteBucketHandler(
      bucketRepo as any,
      taskRepo as any,
      authSvc as any,
      eventBus as unknown as EventBus,
    )
  })

  it('soft-deletes bucket and emits BucketDeletedEvent when bucket is empty', async () => {
    taskRepo.softDeleteMany.mockResolvedValue([])

    await handler.execute(new DeleteBucketCommand(TENANT_ID, PLAN_ID, BUCKET_ID, ACTOR_ID))

    expect(authSvc.assertCanEditPlan).toHaveBeenCalledWith(ACTOR_ID, PLAN_ID, TENANT_ID)
    expect(bucketRepo.softDelete).toHaveBeenCalledWith(BUCKET_ID, TENANT_ID)
    expect(taskRepo.softDeleteMany).toHaveBeenCalledWith(BUCKET_ID, TENANT_ID)
    // Only BucketDeletedEvent — no task events
    expect(eventBus.publish).toHaveBeenCalledTimes(1)
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(BucketDeletedEvent))
    const event: BucketDeletedEvent = eventBus.publish.mock.calls[0][0]
    expect(event.bucketId).toBe(BUCKET_ID)
    expect(event.planId).toBe(PLAN_ID)
    expect(event.tenantId).toBe(TENANT_ID)
    expect(event.actorId).toBe(ACTOR_ID)
  })

  it('cascade-deletes tasks and emits TaskDeletedEvent per task', async () => {
    const task1 = makeTask('task-1')
    const task2 = makeTask('task-2')
    taskRepo.softDeleteMany.mockResolvedValue([task1.id, task2.id])

    await handler.execute(new DeleteBucketCommand(TENANT_ID, PLAN_ID, BUCKET_ID, ACTOR_ID))

    expect(bucketRepo.softDelete).toHaveBeenCalledWith(BUCKET_ID, TENANT_ID)
    expect(taskRepo.softDeleteMany).toHaveBeenCalledWith(BUCKET_ID, TENANT_ID)

    // BucketDeletedEvent + 2 TaskDeletedEvents
    expect(eventBus.publish).toHaveBeenCalledTimes(3)
    const events = eventBus.publish.mock.calls.map((c) => c[0])
    expect(events.filter((e) => e instanceof BucketDeletedEvent)).toHaveLength(1)
    expect(events.filter((e) => e instanceof TaskDeletedEvent)).toHaveLength(2)
    const taskEvents = events.filter((e) => e instanceof TaskDeletedEvent) as TaskDeletedEvent[]
    const taskIds = taskEvents.map((e) => e.taskId)
    expect(taskIds).toContain('task-1')
    expect(taskIds).toContain('task-2')
    taskEvents.forEach((e) => {
      expect(e.tenantId).toBe(TENANT_ID)
      expect(e.actorId).toBe(ACTOR_ID)
    })
  })

  it('throws BucketNotFoundException when bucket not found', async () => {
    bucketRepo.findById.mockResolvedValue(null)

    await expect(
      handler.execute(new DeleteBucketCommand(TENANT_ID, PLAN_ID, BUCKET_ID, ACTOR_ID)),
    ).rejects.toThrow(BucketNotFoundException)
    expect(bucketRepo.softDelete).not.toHaveBeenCalled()
    expect(taskRepo.softDeleteMany).not.toHaveBeenCalled()
    expect(eventBus.publish).not.toHaveBeenCalled()
  })

  it('throws when authorization fails without deleting', async () => {
    authSvc.assertCanEditPlan.mockRejectedValue(
      new UnauthorizedPlanAccessException(ACTOR_ID, PLAN_ID),
    )

    await expect(
      handler.execute(new DeleteBucketCommand(TENANT_ID, PLAN_ID, BUCKET_ID, ACTOR_ID)),
    ).rejects.toThrow(UnauthorizedPlanAccessException)
    expect(bucketRepo.softDelete).not.toHaveBeenCalled()
    expect(taskRepo.softDeleteMany).not.toHaveBeenCalled()
    expect(eventBus.publish).not.toHaveBeenCalled()
  })
})
