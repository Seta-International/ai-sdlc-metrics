import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PlanIngestor } from './plan-ingestor'
import type { MsGraphClient } from '../ms-graph-client'
import type { IPlanRepository } from '../../../domain/repositories/plan.repository'
import type { IBucketRepository } from '../../../domain/repositories/bucket.repository'
import type { ITaskRepository } from '../../../domain/repositories/task.repository'
import type { IMsPlanSyncStateRepository } from '../../../domain/repositories/ms-plan-sync-state.repository'
import type { IdentityQueryFacade } from '../../../../identity/application/facades/identity-query.facade'
import type { ITaskAttachmentRepository } from '../../../domain/repositories/task-attachment.repository'
import type { PgBossService } from '../../../../../common/jobs/pg-boss.service'

const MS_PLAN = {
  id: 'ms-plan-1',
  '@odata.etag': 'etag-plan-1',
  title: 'Sprint Alpha',
  container: { type: 'group', containerId: 'grp-1' },
}

const MS_BUCKET = {
  id: 'ms-bucket-1',
  '@odata.etag': 'etag-bucket-1',
  planId: 'ms-plan-1',
  name: 'Backlog',
  orderHint: '!',
}

function makeMsTask(id: string, aadAssignments: Record<string, unknown> = {}) {
  return {
    id,
    '@odata.etag': `etag-task-${id}`,
    planId: 'ms-plan-1',
    bucketId: 'ms-bucket-1',
    title: `Task ${id}`,
    orderHint: '!',
    assigneePriority: null,
    percentComplete: 0,
    priority: 5,
    startDateTime: null,
    dueDateTime: null,
    completedDateTime: null,
    appliedCategories: {},
    assignments: aadAssignments,
  }
}

const MS_DETAILS = (taskId: string) => ({
  id: taskId,
  '@odata.etag': `etag-details-${taskId}`,
  description: 'some desc',
  previewType: 'automatic',
  checklist: {},
  references: {},
})

const mockGraph = {
  get: vi.fn(),
  getAllPages: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
} as unknown as MsGraphClient

const mockPlanRepo = {
  findById: vi.fn(),
  findByTenantId: vi.fn(),
  findPersonalByOwner: vi.fn(),
  listAllIds: vi.fn(),
  save: vi.fn(),
  softDelete: vi.fn(),
  upsertFromMs: vi.fn(),
} as unknown as IPlanRepository

const mockBucketRepo = {
  findByPlanId: vi.fn(),
  findById: vi.fn(),
  save: vi.fn(),
  softDelete: vi.fn(),
  upsertFromMs: vi.fn(),
} as unknown as IBucketRepository

const mockTaskRepo = {
  findById: vi.fn(),
  findByBucketId: vi.fn(),
  listByPlanIncludingCompleted: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
  softDelete: vi.fn(),
  softDeleteMany: vi.fn(),
  findByMsTaskId: vi.fn(),
  upsertFromMs: vi.fn(),
  upsertDetailsFromMs: vi.fn(),
  softDeleteFromMs: vi.fn(),
  listByPlan: vi.fn(),
} as unknown as ITaskRepository

const mockSyncStateRepo = {
  get: vi.fn(),
  findByMsPlanId: vi.fn(),
  upsertState: vi.fn(),
  listForTenant: vi.fn(),
  listPausable: vi.fn(),
} as unknown as IMsPlanSyncStateRepository

const mockIdentityFacade = {
  getActorIdByExternalUserId: vi.fn(),
} as unknown as IdentityQueryFacade

const mockAttachmentRepo = {
  list: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  findById: vi.fn(),
  setSyncState: vi.fn(),
  markSynced: vi.fn(),
  markDownloaded: vi.fn(),
  listPendingOlderThan: vi.fn(),
} as unknown as ITaskAttachmentRepository

const mockPgBoss = {
  enqueue: vi.fn(),
} as unknown as PgBossService

describe('PlanIngestor', () => {
  let ingestor: PlanIngestor

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(mockGraph.get).mockResolvedValue({ status: 200, body: MS_PLAN, etag: 'etag-plan-1' })
    vi.mocked(mockGraph.getAllPages).mockImplementation(async (_tenantId: string, path: string) => {
      if (path.includes('/buckets')) return [MS_BUCKET]
      if (path.includes('/tasks')) return [makeMsTask('t1')]
      return []
    })
    vi.mocked(mockSyncStateRepo.findByMsPlanId).mockResolvedValue(null)
    vi.mocked(mockPlanRepo.upsertFromMs).mockResolvedValue({ id: 'local-plan-1' })
    vi.mocked(mockSyncStateRepo.upsertState).mockResolvedValue(undefined)
    vi.mocked(mockBucketRepo.upsertFromMs).mockResolvedValue(undefined)
    vi.mocked(mockTaskRepo.findByMsTaskId).mockResolvedValue(null)
    vi.mocked(mockTaskRepo.upsertFromMs).mockResolvedValue({ id: 'local-task-1' })
    vi.mocked(mockTaskRepo.upsertDetailsFromMs).mockResolvedValue(undefined)
    vi.mocked(mockTaskRepo.listByPlan).mockResolvedValue([])
    vi.mocked(mockIdentityFacade.getActorIdByExternalUserId).mockResolvedValue(null)
    vi.mocked(mockAttachmentRepo.list).mockResolvedValue([])
    vi.mocked(mockPgBoss.enqueue).mockResolvedValue(undefined)

    ingestor = new PlanIngestor(
      mockGraph,
      mockPlanRepo,
      mockBucketRepo,
      mockTaskRepo,
      mockSyncStateRepo,
      mockAttachmentRepo,
      mockIdentityFacade,
      mockPgBoss,
    )
  })

  it('ingests plan, buckets, tasks, details in one pass', async () => {
    vi.mocked(mockGraph.get).mockImplementation(async (_t: string, path: string) => {
      if (path.includes('/details')) return { status: 200, body: MS_DETAILS('t1'), etag: null }
      return { status: 200, body: MS_PLAN, etag: 'etag-plan-1' }
    })

    await ingestor.ingestPlan({ tenantId: 't1', msPlanId: 'ms-plan-1', origin: 'ms-sync-backfill' })

    expect(mockSyncStateRepo.findByMsPlanId).toHaveBeenCalledWith('t1', 'ms-plan-1')
    expect(mockPlanRepo.upsertFromMs).toHaveBeenCalledWith(
      expect.objectContaining({ msPlanId: 'ms-plan-1', title: 'Sprint Alpha' }),
      { origin: 'ms-sync-backfill' },
    )
    expect(mockSyncStateRepo.upsertState).toHaveBeenCalledTimes(1)
    expect(mockBucketRepo.upsertFromMs).toHaveBeenCalledWith(
      expect.objectContaining({ msBucketId: 'ms-bucket-1', localPlanId: 'local-plan-1' }),
      { origin: 'ms-sync-backfill' },
    )
    expect(mockTaskRepo.upsertFromMs).toHaveBeenCalledWith(
      expect.objectContaining({ msTaskId: 't1', localPlanId: 'local-plan-1' }),
      { origin: 'ms-sync-backfill' },
    )
    expect(mockTaskRepo.upsertDetailsFromMs).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'local-task-1', msDetailsEtag: 'etag-details-t1' }),
      { origin: 'ms-sync-backfill' },
    )
    expect(mockTaskRepo.listByPlan).toHaveBeenCalledWith('local-plan-1', { onlySynced: true })
  })

  it('resolves assignees through IdentityQueryFacade', async () => {
    const taskWithAssignee = makeMsTask('t2', { 'aad-oid-1': { orderHint: '!' } })
    vi.mocked(mockGraph.getAllPages).mockImplementation(async (_t: string, path: string) => {
      if (path.includes('/buckets')) return [MS_BUCKET]
      if (path.includes('/tasks')) return [taskWithAssignee]
      return []
    })
    vi.mocked(mockGraph.get).mockImplementation(async (_t: string, path: string) => {
      if (path.includes('/details')) return { status: 200, body: MS_DETAILS('t2'), etag: null }
      return { status: 200, body: MS_PLAN, etag: 'etag-plan-1' }
    })
    vi.mocked(mockIdentityFacade.getActorIdByExternalUserId).mockResolvedValue('local-actor-1')

    await ingestor.ingestPlan({ tenantId: 't1', msPlanId: 'ms-plan-1', origin: 'ms-sync-backfill' })

    expect(mockIdentityFacade.getActorIdByExternalUserId).toHaveBeenCalledWith('aad-oid-1', 't1')
    expect(mockTaskRepo.upsertFromMs).toHaveBeenCalledWith(
      expect.objectContaining({ assigneeActorIds: ['local-actor-1'], pendingMsAssignments: [] }),
      expect.anything(),
    )
  })

  it('unresolved AAD OIDs land in pending_ms_assignments', async () => {
    const taskWithUnknownAssignee = makeMsTask('t3', { 'unknown-aad-oid': { orderHint: '!' } })
    vi.mocked(mockGraph.getAllPages).mockImplementation(async (_t: string, path: string) => {
      if (path.includes('/buckets')) return [MS_BUCKET]
      if (path.includes('/tasks')) return [taskWithUnknownAssignee]
      return []
    })
    vi.mocked(mockGraph.get).mockImplementation(async (_t: string, path: string) => {
      if (path.includes('/details')) return { status: 200, body: MS_DETAILS('t3'), etag: null }
      return { status: 200, body: MS_PLAN, etag: 'etag-plan-1' }
    })
    vi.mocked(mockIdentityFacade.getActorIdByExternalUserId).mockResolvedValue(null)

    await ingestor.ingestPlan({ tenantId: 't1', msPlanId: 'ms-plan-1', origin: 'ms-sync-backfill' })

    expect(mockTaskRepo.upsertFromMs).toHaveBeenCalledWith(
      expect.objectContaining({
        assigneeActorIds: [],
        pendingMsAssignments: ['unknown-aad-oid'],
      }),
      expect.anything(),
    )
  })

  it('enqueues pending_download attachment for each new MS reference in task details', async () => {
    const refUrl = 'https%3A//sharepoint.example.com/sites/team/file.pdf'
    vi.mocked(mockGraph.get).mockImplementation(async (_t: string, path: string) => {
      if (path.includes('/details'))
        return {
          status: 200,
          body: {
            ...MS_DETAILS('t1'),
            references: {
              [refUrl]: { alias: 'file.pdf', type: 'other' },
            },
          },
          etag: null,
        }
      return { status: 200, body: MS_PLAN, etag: 'etag-plan-1' }
    })
    vi.mocked(mockAttachmentRepo.list).mockResolvedValue([])

    await ingestor.ingestPlan({ tenantId: 't1', msPlanId: 'ms-plan-1', origin: 'ms-sync-backfill' })

    expect(mockAttachmentRepo.add).toHaveBeenCalledOnce()
    expect(mockPgBoss.enqueue).toHaveBeenCalledWith(
      'ms-sync-pull-attachment',
      expect.objectContaining({ tenantId: 't1' }),
      expect.any(Object),
    )
  })

  it('respects If-None-Match — skips details fetch when task etag unchanged', async () => {
    const existingEtag = 'etag-task-t1'
    vi.mocked(mockTaskRepo.findByMsTaskId).mockResolvedValue({
      id: 'existing-task-id',
      msTaskEtag: existingEtag,
      msDetailsEtag: 'etag-details-t1',
      msSoftDeletedAt: null,
    })
    // task from MS has the same etag
    vi.mocked(mockGraph.getAllPages).mockImplementation(async (_t: string, path: string) => {
      if (path.includes('/buckets')) return [MS_BUCKET]
      if (path.includes('/tasks')) return [makeMsTask('t1')] // etag = 'etag-task-t1'
      return []
    })

    await ingestor.ingestPlan({ tenantId: 't1', msPlanId: 'ms-plan-1', origin: 'ms-sync-backfill' })

    // details endpoint should NOT be called when etag unchanged and msDetailsEtag exists
    const detailsCalled = vi
      .mocked(mockGraph.get)
      .mock.calls.some(([, path]) => (path as string).includes('/details'))
    expect(detailsCalled).toBe(false)
    expect(mockTaskRepo.upsertDetailsFromMs).not.toHaveBeenCalled()
  })
})
