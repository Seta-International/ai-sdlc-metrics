import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MsSyncPushListener } from './ms-sync-push.listener'
import type { IPlanRepository } from '../../domain/repositories/plan.repository'
import type { IdentityQueryFacade } from '../../../identity/application/facades/identity-query.facade'
import type { AdminQueryFacade } from '../../../admin/application/facades/admin-query.facade'
import type { PgBossService } from '../../../../common/jobs/pg-boss.service'
import { PlanContainer } from '../../domain/value-objects/plan-container.vo'

const TENANT_ID = 'tenant-abc'
const PLAN_ID = 'plan-123'
const TASK_ID = 'task-456'
const BUCKET_ID = 'bucket-789'
const ATTACHMENT_ID = 'attach-abc'

function makeMsGroupPlan() {
  return {
    container: PlanContainer.of({ type: 'ms_group', externalId: 'group-1' }),
  }
}

function makeFutureOnlyPlan() {
  return {
    container: PlanContainer.of({ type: 'future_only' }),
  }
}

describe('MsSyncPushListener', () => {
  let pgBoss: { enqueue: ReturnType<typeof vi.fn> }
  let planRepo: { findById: ReturnType<typeof vi.fn> }
  let identityFacade: { getGraphCredential: ReturnType<typeof vi.fn> }
  let adminFacade: { getPlannerViewFlags: ReturnType<typeof vi.fn> }
  let listener: MsSyncPushListener

  beforeEach(() => {
    pgBoss = { enqueue: vi.fn().mockResolvedValue('job-id') }
    planRepo = { findById: vi.fn() }
    identityFacade = { getGraphCredential: vi.fn() }
    adminFacade = {
      getPlannerViewFlags: vi.fn().mockResolvedValue({ msSyncAttachmentsEnabled: true }),
    }
    listener = new MsSyncPushListener(
      pgBoss as unknown as PgBossService,
      planRepo as unknown as IPlanRepository,
      identityFacade as unknown as IdentityQueryFacade,
      adminFacade as unknown as AdminQueryFacade,
    )
  })

  it('skips events with ms-sync-* origin (e.g. ms-sync-pull)', async () => {
    await listener.handle({
      tenantId: TENANT_ID,
      planId: PLAN_ID,
      taskId: TASK_ID,
      origin: 'ms-sync-pull',
    })

    expect(identityFacade.getGraphCredential).not.toHaveBeenCalled()
    expect(pgBoss.enqueue).not.toHaveBeenCalled()
  })

  it('skips events with ms-sync-push origin', async () => {
    await listener.handle({
      tenantId: TENANT_ID,
      planId: PLAN_ID,
      taskId: TASK_ID,
      origin: 'ms-sync-push',
    })

    expect(identityFacade.getGraphCredential).not.toHaveBeenCalled()
    expect(pgBoss.enqueue).not.toHaveBeenCalled()
  })

  it('skips when credential status is not active (e.g. paused)', async () => {
    identityFacade.getGraphCredential.mockResolvedValue({ status: 'paused' })

    await listener.handle({
      tenantId: TENANT_ID,
      planId: PLAN_ID,
      taskId: TASK_ID,
      origin: 'user',
    })

    expect(identityFacade.getGraphCredential).toHaveBeenCalledWith(TENANT_ID)
    expect(pgBoss.enqueue).not.toHaveBeenCalled()
  })

  it('skips when credential is null', async () => {
    identityFacade.getGraphCredential.mockResolvedValue(null)

    await listener.handle({
      tenantId: TENANT_ID,
      planId: PLAN_ID,
      taskId: TASK_ID,
      origin: 'user',
    })

    expect(pgBoss.enqueue).not.toHaveBeenCalled()
  })

  it('skips when plan.container.type is future_only', async () => {
    identityFacade.getGraphCredential.mockResolvedValue({ status: 'active' })
    planRepo.findById.mockResolvedValue(makeFutureOnlyPlan())

    await listener.handle({
      tenantId: TENANT_ID,
      planId: PLAN_ID,
      taskId: TASK_ID,
      origin: 'user',
    })

    expect(planRepo.findById).toHaveBeenCalledWith(PLAN_ID, TENANT_ID)
    expect(pgBoss.enqueue).not.toHaveBeenCalled()
  })

  it('enqueues ms-sync-push-task with singletonKey and startAfter for task events', async () => {
    identityFacade.getGraphCredential.mockResolvedValue({ status: 'active' })
    planRepo.findById.mockResolvedValue(makeMsGroupPlan())

    await listener.handle({
      tenantId: TENANT_ID,
      planId: PLAN_ID,
      taskId: TASK_ID,
      origin: 'user',
    })

    expect(pgBoss.enqueue).toHaveBeenCalledWith(
      'ms-sync-push-task',
      { tenantId: TENANT_ID, taskId: TASK_ID },
      { singletonKey: `push-task:${TASK_ID}`, startAfter: 2 },
    )
  })

  it('enqueues ms-sync-push-plan for plan-only events (no taskId, has planId)', async () => {
    identityFacade.getGraphCredential.mockResolvedValue({ status: 'active' })
    planRepo.findById.mockResolvedValue(makeMsGroupPlan())

    await listener.handle({
      tenantId: TENANT_ID,
      planId: PLAN_ID,
      origin: 'user',
    })

    expect(pgBoss.enqueue).toHaveBeenCalledWith(
      'ms-sync-push-plan',
      { tenantId: TENANT_ID, planId: PLAN_ID },
      { singletonKey: `push-plan:${PLAN_ID}`, startAfter: 2 },
    )
  })

  it('enqueues ms-sync-push-bucket for bucket events', async () => {
    identityFacade.getGraphCredential.mockResolvedValue({ status: 'active' })
    planRepo.findById.mockResolvedValue(makeMsGroupPlan())

    await listener.handle({
      tenantId: TENANT_ID,
      planId: PLAN_ID,
      bucketId: BUCKET_ID,
      origin: 'user',
    })

    expect(pgBoss.enqueue).toHaveBeenCalledWith(
      'ms-sync-push-bucket',
      { tenantId: TENANT_ID, bucketId: BUCKET_ID },
      { singletonKey: `push-bucket:${BUCKET_ID}`, startAfter: 2 },
    )
  })

  it('no-ops for non-planner events (no origin field)', async () => {
    await listener.handle({ type: 'other.event', tenantId: TENANT_ID })

    expect(identityFacade.getGraphCredential).not.toHaveBeenCalled()
    expect(pgBoss.enqueue).not.toHaveBeenCalled()
  })

  it('no-ops for primitive values', async () => {
    await listener.handle('not-an-object')
    await listener.handle(null)
    await listener.handle(undefined)

    expect(identityFacade.getGraphCredential).not.toHaveBeenCalled()
    expect(pgBoss.enqueue).not.toHaveBeenCalled()
  })

  it('enqueues ms-sync-push-task for attachment events (no planId) without plan check', async () => {
    identityFacade.getGraphCredential.mockResolvedValue({ status: 'active' })

    await listener.handle({
      tenantId: TENANT_ID,
      taskId: TASK_ID,
      origin: 'user',
      // no planId — attachment-style event
    })

    expect(planRepo.findById).not.toHaveBeenCalled()
    expect(pgBoss.enqueue).toHaveBeenCalledWith(
      'ms-sync-push-task',
      { tenantId: TENANT_ID, taskId: TASK_ID },
      { singletonKey: `push-task:${TASK_ID}`, startAfter: 2 },
    )
  })

  it('attachment event + flag on → enqueues ms-sync-push-attachment', async () => {
    identityFacade.getGraphCredential.mockResolvedValue({ status: 'active' })
    adminFacade.getPlannerViewFlags.mockResolvedValue({ msSyncAttachmentsEnabled: true })

    await listener.handle({
      tenantId: TENANT_ID,
      taskId: TASK_ID,
      attachmentId: ATTACHMENT_ID,
      origin: 'user',
    })

    expect(pgBoss.enqueue).toHaveBeenCalledWith(
      'ms-sync-push-attachment',
      { attachmentId: ATTACHMENT_ID, tenantId: TENANT_ID },
      { singletonKey: `push-attachment:${ATTACHMENT_ID}` },
    )
  })

  it('attachment event + flag off → no-op', async () => {
    identityFacade.getGraphCredential.mockResolvedValue({ status: 'active' })
    adminFacade.getPlannerViewFlags.mockResolvedValue({ msSyncAttachmentsEnabled: false })

    await listener.handle({
      tenantId: TENANT_ID,
      taskId: TASK_ID,
      attachmentId: ATTACHMENT_ID,
      origin: 'user',
    })

    expect(pgBoss.enqueue).not.toHaveBeenCalled()
  })
})
