import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { Task } from '../../../domain/entities/task.entity'
import { PlanContainer } from '../../../domain/value-objects/plan-container.vo'
import { Plan } from '../../../domain/entities/plan.entity'
import { Bucket } from '../../../domain/entities/bucket.entity'
import type { ITaskRepository } from '../../../domain/repositories/task.repository'
import type { IPlanRepository } from '../../../domain/repositories/plan.repository'
import type { IBucketRepository } from '../../../domain/repositories/bucket.repository'
import type { IMsSyncConflictRepository } from '../../../domain/repositories/ms-sync-conflict.repository'
import type { MsGraphClient } from '../../../infrastructure/ms-graph/ms-graph-client'
import type { OutboxDirtyFieldsQuery } from '../../../infrastructure/outbox/outbox-dirty-fields.query'
import type { IdentityQueryFacade } from '../../../../identity/application/facades/identity-query.facade'
import { PushTaskCommand } from './push-task.command'
import { PushTaskHandler, TenantPushPausedError } from './push-task.handler'

const TENANT_ID = 'tenant-1'
const TASK_ID = 'task-1'
const MS_TASK_ID = 'ms-task-abc'
const MS_TASK_ETAG = '"etag-task-1"'
const MS_DETAILS_ETAG = '"etag-details-1"'
const BUCKET_ID = 'bucket-1'
const MS_BUCKET_ID = 'ms-bucket-xyz'
const PLAN_ID = 'plan-1'

function makeTask(overrides: Partial<Parameters<typeof Task.reconstitute>[0]> = {}): Task {
  return Task.reconstitute({
    id: TASK_ID,
    tenantId: TENANT_ID,
    planId: PLAN_ID,
    bucketId: BUCKET_ID,
    title: 'My Task',
    description: 'Some description',
    progress: 0,
    priority: 5,
    startDate: null,
    dueDate: null,
    orderHint: ' !',
    createdBy: 'actor-1',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
    completedBy: null,
    completedAt: null,
    deletedAt: null,
    checklistItemCount: 0,
    checklistCheckedCount: 0,
    assignees: [],
    appliedLabels: [],
    coverAttachmentId: null,
    msTaskId: MS_TASK_ID,
    msTaskEtag: MS_TASK_ETAG,
    msTaskDetailsEtag: MS_DETAILS_ETAG,
    pendingMsAssignments: [],
    lastPushedAt: null,
    ...overrides,
  })
}

function makeMsGroupPlan(): Plan {
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
    msPlanId: 'ms-plan-1',
    msPlanEtag: '"plan-etag"',
    buckets: [],
    labels: [],
    members: [],
    ownerActorId: null,
    syncEnabled: true,
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

function makeBucket(msBucketIdOverride: string | null = MS_BUCKET_ID): Bucket {
  return Bucket.reconstitute({
    id: BUCKET_ID,
    tenantId: TENANT_ID,
    planId: PLAN_ID,
    name: 'To Do',
    orderHint: ' !',
    msBucketId: msBucketIdOverride,
    msBucketEtag: '"bucket-etag"',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
  })
}

describe('PushTaskHandler', () => {
  let taskRepo: {
    findById: ReturnType<typeof vi.fn>
    markPushed: ReturnType<typeof vi.fn>
    updateMsEtag: ReturnType<typeof vi.fn>
  }
  let planRepo: { findById: ReturnType<typeof vi.fn> }
  let bucketRepo: { findById: ReturnType<typeof vi.fn> }
  let conflictRepo: { insert: ReturnType<typeof vi.fn> }
  let graph: { patch: ReturnType<typeof vi.fn> }
  let dirtyQuery: { forTask: ReturnType<typeof vi.fn> }
  let identityFacade: {
    getGraphCredential: ReturnType<typeof vi.fn>
    getExternalUserId: ReturnType<typeof vi.fn>
  }
  let eventBus: { publish: ReturnType<typeof vi.fn> }
  let handler: PushTaskHandler

  const activeCredential = { status: 'active' as const }

  beforeEach(() => {
    taskRepo = {
      findById: vi.fn().mockResolvedValue(makeTask()),
      markPushed: vi.fn().mockResolvedValue(undefined),
      updateMsEtag: vi.fn().mockResolvedValue(undefined),
    }
    planRepo = { findById: vi.fn().mockResolvedValue(makeMsGroupPlan()) }
    bucketRepo = { findById: vi.fn().mockResolvedValue(makeBucket()) }
    conflictRepo = { insert: vi.fn().mockResolvedValue(undefined) }
    graph = {
      patch: vi.fn().mockResolvedValue({
        status: 200,
        body: { '@odata.etag': '"new-etag"' },
        etag: '"new-etag"',
      }),
    }
    dirtyQuery = { forTask: vi.fn().mockResolvedValue(new Set()) }
    identityFacade = {
      getGraphCredential: vi.fn().mockResolvedValue(activeCredential),
      getExternalUserId: vi.fn().mockResolvedValue('aad-user-1'),
    }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }

    handler = new PushTaskHandler(
      taskRepo as unknown as ITaskRepository,
      planRepo as unknown as IPlanRepository,
      bucketRepo as unknown as IBucketRepository,
      conflictRepo as unknown as IMsSyncConflictRepository,
      graph as unknown as MsGraphClient,
      dirtyQuery as unknown as OutboxDirtyFieldsQuery,
      identityFacade as unknown as IdentityQueryFacade,
      eventBus as unknown as EventBus,
    )
  })

  it('dirty percentComplete only → single PATCH to /planner/tasks/{id}', async () => {
    const task = makeTask({ progress: 50 })
    taskRepo.findById.mockResolvedValue(task)
    dirtyQuery.forTask.mockResolvedValue(new Set(['percentComplete']))

    await handler.execute(new PushTaskCommand(TASK_ID, TENANT_ID))

    expect(graph.patch).toHaveBeenCalledOnce()
    expect(graph.patch).toHaveBeenCalledWith(
      TENANT_ID,
      `/planner/tasks/${encodeURIComponent(MS_TASK_ID)}`,
      expect.objectContaining({ percentComplete: 50 }),
      expect.objectContaining({ ifMatch: MS_TASK_ETAG }),
    )
    expect(taskRepo.markPushed).toHaveBeenCalledWith(TASK_ID, expect.any(Date))
  })

  it('dirty description → single PATCH to /planner/tasks/{id}/details', async () => {
    const task = makeTask({ description: 'Updated description' })
    taskRepo.findById.mockResolvedValue(task)
    dirtyQuery.forTask.mockResolvedValue(new Set(['description']))

    await handler.execute(new PushTaskCommand(TASK_ID, TENANT_ID))

    expect(graph.patch).toHaveBeenCalledOnce()
    expect(graph.patch).toHaveBeenCalledWith(
      TENANT_ID,
      `/planner/tasks/${encodeURIComponent(MS_TASK_ID)}/details`,
      expect.objectContaining({ description: 'Updated description' }),
      expect.objectContaining({ ifMatch: MS_DETAILS_ETAG }),
    )
    expect(taskRepo.markPushed).toHaveBeenCalledWith(TASK_ID, expect.any(Date))
  })

  it('mixed dirt → two PATCHes, each with If-Match from respective etag', async () => {
    dirtyQuery.forTask.mockResolvedValue(new Set(['title', 'description']))

    await handler.execute(new PushTaskCommand(TASK_ID, TENANT_ID))

    expect(graph.patch).toHaveBeenCalledTimes(2)

    const taskPatchCall = graph.patch.mock.calls.find((c: unknown[]) =>
      (c[1] as string).endsWith(`/planner/tasks/${encodeURIComponent(MS_TASK_ID)}`),
    )
    const detailsPatchCall = graph.patch.mock.calls.find((c: unknown[]) =>
      (c[1] as string).endsWith('/details'),
    )

    expect(taskPatchCall).toBeDefined()
    expect((taskPatchCall![3] as { ifMatch?: string }).ifMatch).toBe(MS_TASK_ETAG)

    expect(detailsPatchCall).toBeDefined()
    expect((detailsPatchCall![3] as { ifMatch?: string }).ifMatch).toBe(MS_DETAILS_ETAG)
  })

  it('no dirty fields → no Graph calls (idempotent)', async () => {
    dirtyQuery.forTask.mockResolvedValue(new Set())

    await handler.execute(new PushTaskCommand(TASK_ID, TENANT_ID))

    expect(graph.patch).not.toHaveBeenCalled()
    expect(taskRepo.markPushed).not.toHaveBeenCalled()
  })

  it('future_only plan → no-op', async () => {
    planRepo.findById.mockResolvedValue(makeFutureOnlyPlan())

    await handler.execute(new PushTaskCommand(TASK_ID, TENANT_ID))

    expect(graph.patch).not.toHaveBeenCalled()
    expect(taskRepo.markPushed).not.toHaveBeenCalled()
  })

  it('credential paused → TenantPushPausedError', async () => {
    dirtyQuery.forTask.mockResolvedValue(new Set(['title']))
    identityFacade.getGraphCredential.mockResolvedValue({ status: 'paused' })

    await expect(handler.execute(new PushTaskCommand(TASK_ID, TENANT_ID))).rejects.toThrow(
      TenantPushPausedError,
    )
    expect(graph.patch).not.toHaveBeenCalled()
  })
})
