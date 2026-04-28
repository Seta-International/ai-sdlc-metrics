import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PushAttachmentHandler } from './push-attachment.handler'
import { PushAttachmentCommand } from './push-attachment.command'
import { TaskAttachment } from '../../../domain/entities/task-attachment.entity'
import { PlanContainer } from '../../../domain/value-objects/plan-container.vo'

const tenantId = 'tenant-1'
const attachmentId = 'attach-1'
const taskId = 'task-1'
const planId = 'plan-1'

function makeFileAttachment(
  overrides: Partial<{
    msSyncState: string
    taskId: string
    msReferenceUrl: string | null
    msSharepointDriveId: string | null
    msSharepointItemId: string | null
  }> = {},
) {
  return TaskAttachment.reconstitute({
    id: attachmentId,
    taskId: overrides.taskId ?? taskId,
    tenantId,
    createdBy: 'actor-1',
    kind: 'file',
    storageKey: 'tenants/tenant-1/attachments/attach-1',
    filename: 'file.pdf',
    contentType: 'application/pdf',
    sizeBytes: 1000,
    url: null,
    linkTitle: null,
    previewType: null,
    createdAt: new Date(),
    msSyncState: (overrides.msSyncState ?? 'pending_upload') as any,
    msReferenceUrl: overrides.msReferenceUrl ?? null,
    msSharepointDriveId: overrides.msSharepointDriveId ?? null,
    msSharepointItemId: overrides.msSharepointItemId ?? null,
  })
}

function makeTask(msTaskId: string | null = 'ms-task-1') {
  return { id: taskId, planId, msTaskId, msTaskEtag: 'etag-1' }
}

function makePlan(containerType: 'ms_group' | 'ms_roster' | 'future_only' = 'ms_group') {
  return {
    id: planId,
    name: 'My Plan',
    msPlanId: 'ms-plan-1',
    container:
      containerType === 'future_only'
        ? PlanContainer.of({ type: 'future_only' })
        : PlanContainer.of({ type: containerType, externalId: 'group-abc' }),
  }
}

function makeHandler(overrides: Record<string, unknown> = {}) {
  const attachmentRepo = {
    findById: vi.fn().mockResolvedValue(makeFileAttachment()),
    setSyncState: vi.fn().mockResolvedValue(undefined),
    markSynced: vi.fn().mockResolvedValue(undefined),
  }
  const taskRepo = {
    findById: vi.fn().mockResolvedValue(makeTask()),
    findByMsTaskId: vi.fn().mockResolvedValue({
      id: taskId,
      msTaskEtag: 'etag-1',
      msDetailsEtag: 'detag-1',
      msSoftDeletedAt: null,
    }),
    updateMsEtag: vi.fn().mockResolvedValue(undefined),
  }
  const planRepo = {
    findById: vi.fn().mockResolvedValue(makePlan('ms_group')),
  }
  const storage = {
    getDownloadUrl: vi
      .fn()
      .mockResolvedValue({ url: 'https://s3/presigned', expiresAt: new Date() }),
  }
  const sharepoint = {
    getGroupDefaultDriveId: vi.fn().mockResolvedValue({ siteId: 'site-1', driveId: 'drive-1' }),
    ensureFolder: vi.fn().mockResolvedValue({ itemId: 'folder-1' }),
    uploadSmall: vi
      .fn()
      .mockResolvedValue({ itemId: 'item-1', webUrl: 'https://sp/file.pdf', driveId: 'drive-1' }),
    createUploadSession: vi.fn().mockResolvedValue({ uploadUrl: 'https://sp/session' }),
    uploadChunk: vi.fn().mockResolvedValue({
      status: 201,
      itemId: 'item-1',
      webUrl: 'https://sp/big.pdf',
      driveId: 'drive-1',
    }),
  }
  const graph = {
    patch: vi
      .fn()
      .mockResolvedValue({ status: 200, body: { '@odata.etag': 'new-detag' }, etag: 'new-detag' }),
    get: vi.fn(),
  }
  return {
    handler: new PushAttachmentHandler(
      attachmentRepo as any,
      taskRepo as any,
      planRepo as any,
      storage as any,
      sharepoint as any,
      graph as any,
    ),
    attachmentRepo,
    taskRepo,
    planRepo,
    storage,
    sharepoint,
    graph,
    ...overrides,
  }
}

describe('PushAttachmentHandler', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(1000),
    })
  })

  it('ms_roster plan → marks not_syncable and returns', async () => {
    const { handler, attachmentRepo, planRepo } = makeHandler()
    planRepo.findById.mockResolvedValue(makePlan('ms_roster'))
    await handler.execute(new PushAttachmentCommand(attachmentId, tenantId))
    expect(attachmentRepo.setSyncState).toHaveBeenCalledWith(attachmentId, tenantId, 'not_syncable')
    expect(attachmentRepo.markSynced).not.toHaveBeenCalled()
  })

  it('future_only plan → no-op', async () => {
    const { handler, attachmentRepo, planRepo } = makeHandler()
    planRepo.findById.mockResolvedValue(makePlan('future_only'))
    await handler.execute(new PushAttachmentCommand(attachmentId, tenantId))
    expect(attachmentRepo.setSyncState).not.toHaveBeenCalled()
    expect(attachmentRepo.markSynced).not.toHaveBeenCalled()
  })

  it('small file (<4MB) → uploadSmall then markSynced', async () => {
    const { handler, sharepoint, attachmentRepo } = makeHandler()
    await handler.execute(new PushAttachmentCommand(attachmentId, tenantId))
    expect(sharepoint.uploadSmall).toHaveBeenCalled()
    expect(sharepoint.createUploadSession).not.toHaveBeenCalled()
    expect(attachmentRepo.markSynced).toHaveBeenCalledWith(attachmentId, tenantId, {
      msReferenceUrl: 'https://sp/file.pdf',
      msSharepointDriveId: 'drive-1',
      msSharepointItemId: 'item-1',
    })
  })

  it('attachment not pending_upload → no-op', async () => {
    const { handler, attachmentRepo, sharepoint } = makeHandler()
    attachmentRepo.findById.mockResolvedValue(makeFileAttachment({ msSyncState: 'synced' }))
    await handler.execute(new PushAttachmentCommand(attachmentId, tenantId))
    expect(sharepoint.uploadSmall).not.toHaveBeenCalled()
  })

  it('on PATCH 412 → re-fetch etag and retry once', async () => {
    const { handler, graph } = makeHandler()
    const { GraphPreconditionFailedError } = await import('../../../infrastructure/ms-graph/errors')
    graph.patch
      .mockRejectedValueOnce(new GraphPreconditionFailedError('412', 412, {}))
      .mockResolvedValueOnce({
        status: 200,
        body: { '@odata.etag': 'new-detag' },
        etag: 'new-detag',
      })
    graph.get.mockResolvedValue({
      status: 200,
      body: { '@odata.etag': 'fresh-etag' },
      etag: 'fresh-etag',
    })
    await handler.execute(new PushAttachmentCommand(attachmentId, tenantId))
    expect(graph.patch).toHaveBeenCalledTimes(2)
  })
})
