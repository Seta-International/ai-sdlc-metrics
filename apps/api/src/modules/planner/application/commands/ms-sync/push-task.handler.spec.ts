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
import type { IdentityMsGraphCredentialFacade } from '../../../../identity/application/facades/identity-ms-graph-credential.facade'
import {
  GraphAuthError,
  GraphPreconditionFailedError,
  GraphQuotaError,
  GraphServerError,
  GraphThrottledError,
} from '../../../infrastructure/ms-graph/errors'
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
    applyMsWonFields: ReturnType<typeof vi.fn>
  }
  let planRepo: { findById: ReturnType<typeof vi.fn> }
  let bucketRepo: { findById: ReturnType<typeof vi.fn> }
  let conflictRepo: { insert: ReturnType<typeof vi.fn> }
  let graph: { patch: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> }
  let dirtyQuery: { forTask: ReturnType<typeof vi.fn> }
  let identityFacade: {
    getGraphCredential: ReturnType<typeof vi.fn>
    getExternalUserId: ReturnType<typeof vi.fn>
  }
  let msCredFacade: {
    markCredentialInvalid: ReturnType<typeof vi.fn>
    setPushPausedUntil: ReturnType<typeof vi.fn>
  }
  let eventBus: { publish: ReturnType<typeof vi.fn> }
  let handler: PushTaskHandler

  const activeCredential = { status: 'active' as const }

  beforeEach(() => {
    taskRepo = {
      findById: vi.fn().mockResolvedValue(makeTask()),
      markPushed: vi.fn().mockResolvedValue(undefined),
      updateMsEtag: vi.fn().mockResolvedValue(undefined),
      applyMsWonFields: vi.fn().mockResolvedValue(undefined),
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
      get: vi.fn().mockResolvedValue({
        status: 200,
        body: { '@odata.etag': '"fresh-etag"' },
        etag: '"fresh-etag"',
      }),
    }
    dirtyQuery = { forTask: vi.fn().mockResolvedValue(new Set()) }
    identityFacade = {
      getGraphCredential: vi.fn().mockResolvedValue(activeCredential),
      getExternalUserId: vi.fn().mockResolvedValue('aad-user-1'),
    }
    msCredFacade = {
      markCredentialInvalid: vi.fn().mockResolvedValue(undefined),
      setPushPausedUntil: vi.fn().mockResolvedValue(undefined),
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
      msCredFacade as unknown as IdentityMsGraphCredentialFacade,
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

  describe('412 recovery', () => {
    const FRESH_ETAG = '"fresh-etag-after-412"'

    it('412: MS field unchanged → merged patch retried with fresh etag, etag updated', async () => {
      const task = makeTask({ progress: 75 })
      taskRepo.findById.mockResolvedValue(task)
      dirtyQuery.forTask.mockResolvedValue(new Set(['percentComplete']))

      graph.patch
        .mockRejectedValueOnce(new GraphPreconditionFailedError('412', 412, {}))
        .mockResolvedValueOnce({
          status: 200,
          body: { '@odata.etag': '"retry-etag"' },
          etag: '"retry-etag"',
        })

      graph.get.mockResolvedValueOnce({
        status: 200,
        body: { '@odata.etag': FRESH_ETAG, percentComplete: 75 },
        etag: FRESH_ETAG,
      })

      await handler.execute(new PushTaskCommand(TASK_ID, TENANT_ID))

      expect(graph.get).toHaveBeenCalledOnce()
      expect(graph.patch).toHaveBeenCalledTimes(2)
      const retryCall = graph.patch.mock.calls[1]
      expect(retryCall[2]).toMatchObject({ percentComplete: 75 })
      expect(retryCall[3]).toMatchObject({ ifMatch: FRESH_ETAG })
      expect(taskRepo.updateMsEtag).toHaveBeenCalledWith(TASK_ID, { msTaskEtag: '"retry-etag"' })
      expect(conflictRepo.insert).not.toHaveBeenCalled()
    })

    it('412: MS field changed → field_lww conflict written, no retry PATCH', async () => {
      const task = makeTask({ progress: 75 })
      taskRepo.findById.mockResolvedValue(task)
      dirtyQuery.forTask.mockResolvedValue(new Set(['percentComplete']))

      graph.patch.mockRejectedValueOnce(new GraphPreconditionFailedError('412', 412, {}))

      graph.get.mockResolvedValueOnce({
        status: 200,
        body: { '@odata.etag': FRESH_ETAG, percentComplete: 60 },
        etag: FRESH_ETAG,
      })

      await handler.execute(new PushTaskCommand(TASK_ID, TENANT_ID))

      expect(graph.patch).toHaveBeenCalledOnce()
      expect(conflictRepo.insert).toHaveBeenCalledOnce()
      const conflict = conflictRepo.insert.mock.calls[0][0]
      expect(conflict.kind).toBe('field_lww')
      expect(conflict.field).toBe('percentComplete')
    })

    it('412: all MS fields changed → two conflict rows, no retry PATCH, applyMsWonFields NOT called', async () => {
      dirtyQuery.forTask.mockResolvedValue(new Set(['percentComplete', 'title']))

      graph.patch.mockRejectedValueOnce(new GraphPreconditionFailedError('412', 412, {}))

      graph.get.mockResolvedValueOnce({
        status: 200,
        body: { '@odata.etag': FRESH_ETAG, percentComplete: 60, title: 'MS Changed Title' },
        etag: FRESH_ETAG,
      })

      await handler.execute(new PushTaskCommand(TASK_ID, TENANT_ID))

      expect(graph.patch).toHaveBeenCalledOnce()
      expect(conflictRepo.insert).toHaveBeenCalledTimes(2)
      const kinds = conflictRepo.insert.mock.calls.map(
        (c: unknown[]) => (c[0] as { kind: string }).kind,
      )
      expect(kinds).toEqual(['field_lww', 'field_lww'])
      expect(taskRepo.applyMsWonFields).not.toHaveBeenCalled()
    })

    it('412 on retry (attempt=1) → push_412_exhausted conflict, no further PATCH', async () => {
      const task = makeTask({ progress: 75 })
      taskRepo.findById.mockResolvedValue(task)
      dirtyQuery.forTask.mockResolvedValue(new Set(['percentComplete']))

      graph.patch
        .mockRejectedValueOnce(
          new GraphPreconditionFailedError('412 first', 412, { code: 'first' }),
        )
        .mockRejectedValueOnce(
          new GraphPreconditionFailedError('412 retry', 412, { code: 'retry' }),
        )

      graph.get.mockResolvedValueOnce({
        status: 200,
        body: { '@odata.etag': FRESH_ETAG, percentComplete: 75 },
        etag: FRESH_ETAG,
      })

      await handler.execute(new PushTaskCommand(TASK_ID, TENANT_ID))

      expect(graph.patch).toHaveBeenCalledTimes(2)
      expect(conflictRepo.insert).toHaveBeenCalledOnce()
      const conflict = conflictRepo.insert.mock.calls[0][0]
      expect(conflict.kind).toBe('push_412_exhausted')
    })

    it('412 then 429 on retry → setPushPausedUntil called, TenantPushPausedError thrown', async () => {
      const task = makeTask({ progress: 75 })
      taskRepo.findById.mockResolvedValue(task)
      dirtyQuery.forTask.mockResolvedValue(new Set(['percentComplete']))

      graph.patch
        .mockRejectedValueOnce(new GraphPreconditionFailedError('412', 412, {}))
        .mockRejectedValueOnce(new GraphThrottledError('429', {}, 60))

      graph.get.mockResolvedValueOnce({
        status: 200,
        body: { '@odata.etag': FRESH_ETAG, percentComplete: 75 },
        etag: FRESH_ETAG,
      })

      await expect(handler.execute(new PushTaskCommand(TASK_ID, TENANT_ID))).rejects.toThrow(
        TenantPushPausedError,
      )
      expect(msCredFacade.setPushPausedUntil).toHaveBeenCalledOnce()
      const [, pauseUntil] = msCredFacade.setPushPausedUntil.mock.calls[0]
      expect(pauseUntil).toBeInstanceOf(Date)
    })
  })

  describe('handlePushError — initial error routing', () => {
    it('429 (throttled) → setPushPausedUntil + TenantPushPausedError', async () => {
      dirtyQuery.forTask.mockResolvedValue(new Set(['title']))
      graph.patch.mockRejectedValueOnce(new GraphThrottledError('429', {}, 30))

      await expect(handler.execute(new PushTaskCommand(TASK_ID, TENANT_ID))).rejects.toThrow(
        TenantPushPausedError,
      )
      expect(msCredFacade.setPushPausedUntil).toHaveBeenCalledOnce()
      const [tenantIdArg, pauseUntilArg] = msCredFacade.setPushPausedUntil.mock.calls[0]
      expect(tenantIdArg).toBe(TENANT_ID)
      expect(pauseUntilArg).toBeInstanceOf(Date)
    })

    it('401 (auth) → markCredentialInvalid called + credential_invalidated event published', async () => {
      dirtyQuery.forTask.mockResolvedValue(new Set(['title']))
      graph.patch.mockRejectedValueOnce(new GraphAuthError('401 Unauthorized', 401, {}))

      await handler.execute(new PushTaskCommand(TASK_ID, TENANT_ID))

      expect(msCredFacade.markCredentialInvalid).toHaveBeenCalledWith(TENANT_ID, '401 Unauthorized')
      expect(eventBus.publish).toHaveBeenCalledOnce()
      const event = eventBus.publish.mock.calls[0][0]
      expect(event.type).toBe('planner.ms_sync.credential_invalidated')
      expect(event.tenantId).toBe(TENANT_ID)
    })

    it('403 quota → push_403_quota conflict, no throw', async () => {
      dirtyQuery.forTask.mockResolvedValue(new Set(['title']))
      graph.patch.mockRejectedValueOnce(
        new GraphQuotaError('403 Quota', {}, 'MaximumTasksInProject'),
      )

      await handler.execute(new PushTaskCommand(TASK_ID, TENANT_ID))

      expect(conflictRepo.insert).toHaveBeenCalledOnce()
      const conflict = conflictRepo.insert.mock.calls[0][0]
      expect(conflict.kind).toBe('push_403_quota')
    })

    it('5xx server error → rethrown so pg-boss retries', async () => {
      dirtyQuery.forTask.mockResolvedValue(new Set(['title']))
      const serverErr = new GraphServerError('500', 500, {})
      graph.patch.mockRejectedValueOnce(serverErr)

      await expect(handler.execute(new PushTaskCommand(TASK_ID, TENANT_ID))).rejects.toThrow(
        serverErr,
      )
    })

    it('unknown error → push_failed conflict, no throw', async () => {
      dirtyQuery.forTask.mockResolvedValue(new Set(['title']))
      graph.patch.mockRejectedValueOnce(new Error('network timeout'))

      await handler.execute(new PushTaskCommand(TASK_ID, TENANT_ID))

      expect(conflictRepo.insert).toHaveBeenCalledOnce()
      const conflict = conflictRepo.insert.mock.calls[0][0]
      expect(conflict.kind).toBe('push_failed')
    })
  })
})
