import { beforeEach, describe, expect, it, vi } from 'vitest'
import { uuidv7 } from 'uuidv7'
import { PlannerRouterService } from './planner-router.service'
import { plannerRouter } from './planner.router'
import { RequestUploadCommand } from '../../application/commands/attachments/request-upload.command'
import { FinalizeUploadCommand } from '../../application/commands/attachments/finalize-upload.command'
import { AddLinkCommand } from '../../application/commands/attachments/add-link.command'
import { SetCoverCommand } from '../../application/commands/attachments/set-cover.command'
import { RemoveAttachmentCommand } from '../../application/commands/attachments/remove.command'
import type { AdminQueryFacade } from '../../../admin/application/facades/admin-query.facade'

const TENANT_ID = '01900000-0000-7fff-8000-000000005001'
const ACTOR_ID = uuidv7()
const PLAN_ID = uuidv7()
const TASK_ID = uuidv7()
const ATTACHMENT_ID = uuidv7()

function makeCtx() {
  return {
    req: { headers: {} },
    tenantId: TENANT_ID,
    actorId: ACTOR_ID,
  }
}

describe('attachmentRouter — unit (mocked command bus)', () => {
  let commandBus: { execute: ReturnType<typeof vi.fn> }
  let queryBus: { execute: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    commandBus = { execute: vi.fn() }
    queryBus = { execute: vi.fn() }

    const adminQueryFacade: Pick<AdminQueryFacade, 'isPlannerEnabled'> = {
      isPlannerEnabled: vi.fn().mockResolvedValue(true),
    }

    const svc = new PlannerRouterService(
      commandBus as never,
      queryBus as never,
      adminQueryFacade as AdminQueryFacade,
    )
    svc.onModuleInit()
  })

  describe('attachments.requestUpload', () => {
    it('dispatches RequestUploadCommand and returns uploadUrl/storageKey/expiresAt', async () => {
      const expiresAt = new Date(Date.now() + 900_000)
      commandBus.execute.mockResolvedValue({
        uploadUrl: 'https://s3.example.com/upload',
        storageKey: 'tenants/t1/planner/task-1/file.pdf',
        expiresAt,
      })

      const caller = plannerRouter.createCaller(makeCtx())
      const result = (await caller.attachments.requestUpload({
        tenantId: TENANT_ID,
        planId: PLAN_ID,
        taskId: TASK_ID,
        actorId: ACTOR_ID,
        filename: 'file.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1024,
      })) as { uploadUrl: string; storageKey: string; expiresAt: Date }

      expect(commandBus.execute).toHaveBeenCalledOnce()
      const dispatched = commandBus.execute.mock.calls[0][0] as RequestUploadCommand
      expect(dispatched).toBeInstanceOf(RequestUploadCommand)
      expect(dispatched.tenantId).toBe(TENANT_ID)
      expect(dispatched.planId).toBe(PLAN_ID)
      expect(dispatched.taskId).toBe(TASK_ID)
      expect(dispatched.actorId).toBe(ACTOR_ID)
      expect(dispatched.filename).toBe('file.pdf')
      expect(dispatched.contentType).toBe('application/pdf')
      expect(dispatched.sizeBytes).toBe(1024)

      expect(result.uploadUrl).toBe('https://s3.example.com/upload')
      expect(result.storageKey).toBe('tenants/t1/planner/task-1/file.pdf')
      expect(result.expiresAt).toBe(expiresAt)
    })
  })

  describe('attachments.finalizeUpload', () => {
    it('dispatches FinalizeUploadCommand', async () => {
      commandBus.execute.mockResolvedValue(undefined)

      const caller = plannerRouter.createCaller(makeCtx())
      await caller.attachments.finalizeUpload({
        tenantId: TENANT_ID,
        planId: PLAN_ID,
        taskId: TASK_ID,
        attachmentId: ATTACHMENT_ID,
        actorId: ACTOR_ID,
        storageKey: 'tenants/t1/planner/task-1/file.pdf',
        filename: 'file.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1024,
        setAsCover: true,
      })

      expect(commandBus.execute).toHaveBeenCalledOnce()
      const dispatched = commandBus.execute.mock.calls[0][0] as FinalizeUploadCommand
      expect(dispatched).toBeInstanceOf(FinalizeUploadCommand)
      expect(dispatched.attachmentId).toBe(ATTACHMENT_ID)
      expect(dispatched.storageKey).toBe('tenants/t1/planner/task-1/file.pdf')
      expect(dispatched.setAsCover).toBe(true)
    })
  })

  describe('attachments.addLink', () => {
    it('dispatches AddLinkCommand with url and optional linkTitle', async () => {
      commandBus.execute.mockResolvedValue(undefined)

      const caller = plannerRouter.createCaller(makeCtx())
      await caller.attachments.addLink({
        tenantId: TENANT_ID,
        planId: PLAN_ID,
        taskId: TASK_ID,
        attachmentId: ATTACHMENT_ID,
        actorId: ACTOR_ID,
        url: 'https://example.com/doc',
        linkTitle: 'Reference Doc',
      })

      expect(commandBus.execute).toHaveBeenCalledOnce()
      const dispatched = commandBus.execute.mock.calls[0][0] as AddLinkCommand
      expect(dispatched).toBeInstanceOf(AddLinkCommand)
      expect(dispatched.url).toBe('https://example.com/doc')
      expect(dispatched.linkTitle).toBe('Reference Doc')
      expect(dispatched.attachmentId).toBe(ATTACHMENT_ID)
    })

    it('dispatches AddLinkCommand without linkTitle', async () => {
      commandBus.execute.mockResolvedValue(undefined)

      const caller = plannerRouter.createCaller(makeCtx())
      await caller.attachments.addLink({
        tenantId: TENANT_ID,
        planId: PLAN_ID,
        taskId: TASK_ID,
        attachmentId: ATTACHMENT_ID,
        actorId: ACTOR_ID,
        url: 'https://example.com/doc',
      })

      const dispatched = commandBus.execute.mock.calls[0][0] as AddLinkCommand
      expect(dispatched.linkTitle).toBeUndefined()
    })
  })

  describe('attachments.setCover', () => {
    it('dispatches SetCoverCommand with an attachmentId', async () => {
      commandBus.execute.mockResolvedValue(undefined)

      const caller = plannerRouter.createCaller(makeCtx())
      await caller.attachments.setCover({
        tenantId: TENANT_ID,
        planId: PLAN_ID,
        taskId: TASK_ID,
        actorId: ACTOR_ID,
        attachmentId: ATTACHMENT_ID,
        expectedVersion: 'v1',
      })

      expect(commandBus.execute).toHaveBeenCalledOnce()
      const dispatched = commandBus.execute.mock.calls[0][0] as SetCoverCommand
      expect(dispatched).toBeInstanceOf(SetCoverCommand)
      expect(dispatched.attachmentId).toBe(ATTACHMENT_ID)
      expect(dispatched.expectedVersion).toBe('v1')
    })

    it('dispatches SetCoverCommand without attachmentId (clear cover)', async () => {
      commandBus.execute.mockResolvedValue(undefined)

      const caller = plannerRouter.createCaller(makeCtx())
      await caller.attachments.setCover({
        tenantId: TENANT_ID,
        planId: PLAN_ID,
        taskId: TASK_ID,
        actorId: ACTOR_ID,
        expectedVersion: 'v2',
      })

      const dispatched = commandBus.execute.mock.calls[0][0] as SetCoverCommand
      expect(dispatched.attachmentId).toBeUndefined()
    })
  })

  describe('attachments.remove', () => {
    it('dispatches RemoveAttachmentCommand', async () => {
      commandBus.execute.mockResolvedValue(undefined)

      const caller = plannerRouter.createCaller(makeCtx())
      await caller.attachments.remove({
        tenantId: TENANT_ID,
        planId: PLAN_ID,
        taskId: TASK_ID,
        attachmentId: ATTACHMENT_ID,
        actorId: ACTOR_ID,
        expectedVersion: 'v3',
      })

      expect(commandBus.execute).toHaveBeenCalledOnce()
      const dispatched = commandBus.execute.mock.calls[0][0] as RemoveAttachmentCommand
      expect(dispatched).toBeInstanceOf(RemoveAttachmentCommand)
      expect(dispatched.attachmentId).toBe(ATTACHMENT_ID)
      expect(dispatched.actorId).toBe(ACTOR_ID)
      expect(dispatched.expectedVersion).toBe('v3')
    })
  })

  describe('tasks.getDetail — attachments in response', () => {
    it('includes file attachment with presigned URL from storage client', async () => {
      const storageKey = 'tenants/t1/planner/task-1/report.pdf'
      const presignedUrl = 'https://s3.example.com/presigned/report.pdf?token=abc'
      const fileAttachmentId = uuidv7()
      const createdAt = new Date('2026-01-01T00:00:00Z')

      // The query bus returns a TaskDetailSnapshot with attachments populated
      queryBus.execute.mockResolvedValue({
        id: TASK_ID,
        planId: PLAN_ID,
        bucketId: uuidv7(),
        title: 'Test Task',
        description: '',
        progress: 0,
        priority: 0,
        startDate: null,
        dueDate: null,
        orderHint: 'a',
        createdBy: ACTOR_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: null,
        completedBy: null,
        checklistItemCount: 0,
        checklistCheckedCount: 0,
        checklist: [],
        assignees: [],
        appliedLabels: [],
        attachments: [
          {
            id: fileAttachmentId,
            kind: 'file' as const,
            filename: 'report.pdf',
            contentType: 'application/pdf',
            sizeBytes: 2048,
            url: presignedUrl,
            linkTitle: undefined,
            createdBy: ACTOR_ID,
            createdAt,
          },
        ],
        comments: [],
        evidence: [],
      })

      const caller = plannerRouter.createCaller(makeCtx())
      const result = (await caller.tasks.getDetail({
        tenantId: TENANT_ID,
        planId: PLAN_ID,
        taskId: TASK_ID,
        actorId: ACTOR_ID,
      })) as {
        attachments: Array<{
          id: string
          kind: string
          filename?: string
          contentType?: string
          sizeBytes?: number
          url?: string
          createdBy: string
          createdAt: Date
        }>
      }

      expect(Array.isArray(result.attachments)).toBe(true)
      expect(result.attachments).toHaveLength(1)
      const att = result.attachments[0]!
      expect(att.id).toBe(fileAttachmentId)
      expect(att.kind).toBe('file')
      expect(att.filename).toBe('report.pdf')
      expect(att.url).toBe(presignedUrl)
      expect(att.sizeBytes).toBe(2048)
    })

    it('includes link attachment with its url', async () => {
      const linkAttachmentId = uuidv7()
      const createdAt = new Date('2026-01-02T00:00:00Z')

      queryBus.execute.mockResolvedValue({
        id: TASK_ID,
        planId: PLAN_ID,
        bucketId: uuidv7(),
        title: 'Test Task',
        description: '',
        progress: 0,
        priority: 0,
        startDate: null,
        dueDate: null,
        orderHint: 'a',
        createdBy: ACTOR_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: null,
        completedBy: null,
        checklistItemCount: 0,
        checklistCheckedCount: 0,
        checklist: [],
        assignees: [],
        appliedLabels: [],
        attachments: [
          {
            id: linkAttachmentId,
            kind: 'link' as const,
            url: 'https://docs.example.com/spec',
            linkTitle: 'Product Spec',
            createdBy: ACTOR_ID,
            createdAt,
          },
        ],
        comments: [],
        evidence: [],
      })

      const caller = plannerRouter.createCaller(makeCtx())
      const result = (await caller.tasks.getDetail({
        tenantId: TENANT_ID,
        planId: PLAN_ID,
        taskId: TASK_ID,
        actorId: ACTOR_ID,
      })) as {
        attachments: Array<{
          id: string
          kind: string
          url?: string
          linkTitle?: string
        }>
      }

      expect(result.attachments).toHaveLength(1)
      const att = result.attachments[0]!
      expect(att.kind).toBe('link')
      expect(att.url).toBe('https://docs.example.com/spec')
      expect(att.linkTitle).toBe('Product Spec')
    })

    it('returns empty attachments array when task has no attachments', async () => {
      queryBus.execute.mockResolvedValue({
        id: TASK_ID,
        planId: PLAN_ID,
        bucketId: uuidv7(),
        title: 'Test Task',
        description: '',
        progress: 0,
        priority: 0,
        startDate: null,
        dueDate: null,
        orderHint: 'a',
        createdBy: ACTOR_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: null,
        completedBy: null,
        checklistItemCount: 0,
        checklistCheckedCount: 0,
        checklist: [],
        assignees: [],
        appliedLabels: [],
        attachments: [],
        comments: [],
        evidence: [],
      })

      const caller = plannerRouter.createCaller(makeCtx())
      const result = (await caller.tasks.getDetail({
        tenantId: TENANT_ID,
        planId: PLAN_ID,
        taskId: TASK_ID,
        actorId: ACTOR_ID,
      })) as { attachments: unknown[] }

      expect(result.attachments).toEqual([])
    })
  })
})
