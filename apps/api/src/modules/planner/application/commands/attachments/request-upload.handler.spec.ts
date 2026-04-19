import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RequestUploadHandler } from './request-upload.handler'
import { RequestUploadCommand } from './request-upload.command'
import { Task } from '../../../domain/entities/task.entity'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { UnsafeFileTypeException } from '../../../domain/exceptions/unsafe-file-type.exception'
import { FileTooLargeException } from '../../../domain/exceptions/file-too-large.exception'
import type { ITaskRepository } from '../../../domain/repositories/task.repository'
import type { StorageClient } from '@future/storage'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const TASK_ID = 'task-1'
const ACTOR_ID = 'actor-1'
const ATTACHMENT_ID = 'attachment-1'

function makeTask(): Task {
  return Task.create({
    id: TASK_ID,
    tenantId: TENANT_ID,
    planId: PLAN_ID,
    bucketId: 'bucket-1',
    title: 'Task',
    orderHint: ' !',
    createdBy: ACTOR_ID,
  })
}

describe('RequestUploadHandler', () => {
  let handler: RequestUploadHandler
  let taskRepo: { findById: ReturnType<typeof vi.fn> }
  let storageClient: { getUploadUrl: ReturnType<typeof vi.fn> }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }

  const expiresAt = new Date(Date.now() + 900_000)

  beforeEach(() => {
    taskRepo = { findById: vi.fn().mockResolvedValue(makeTask()) }
    storageClient = {
      getUploadUrl: vi.fn().mockResolvedValue({ url: 'https://s3.example.com/upload', expiresAt }),
    }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    handler = new RequestUploadHandler(
      taskRepo as unknown as ITaskRepository,
      storageClient as unknown as StorageClient,
      authSvc as unknown as PlanAuthorizationService,
    )
  })

  it('returns uploadUrl, storageKey, expiresAt for a valid request', async () => {
    const command = new RequestUploadCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      'document.pdf',
      'application/pdf',
      1024 * 1024, // 1 MB
    )

    const result = await handler.execute(command)

    expect(authSvc.assertCanEditPlan).toHaveBeenCalledWith(ACTOR_ID, PLAN_ID, TENANT_ID)
    expect(storageClient.getUploadUrl).toHaveBeenCalledOnce()
    const [key, opts] = storageClient.getUploadUrl.mock.calls[0]
    expect(key).toMatch(new RegExp(`^${TENANT_ID}/documents/planner/${TASK_ID}/`))
    expect(opts.contentType).toBe('application/pdf')
    expect(opts.expiresIn).toBe(900)
    expect(result.uploadUrl).toBe('https://s3.example.com/upload')
    expect(result.storageKey).toBe(key)
    expect(result.expiresAt).toBe(expiresAt)
  })

  it('does NOT create a DB row (attachmentRepo.add never called)', async () => {
    // No attachmentRepo injected — confirms handler makes no DB insert
    const command = new RequestUploadCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      'photo.jpg',
      'image/jpeg',
      512,
    )
    await handler.execute(command)
    // If we get here without error, we confirm no attachment insert happened
    expect(storageClient.getUploadUrl).toHaveBeenCalledOnce()
  })

  it('throws when file size exceeds 50 MB', async () => {
    const command = new RequestUploadCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      'big-file.zip',
      'application/zip',
      51 * 1024 * 1024,
    )

    await expect(handler.execute(command)).rejects.toThrow(FileTooLargeException)
    expect(storageClient.getUploadUrl).not.toHaveBeenCalled()
  })

  it.each(['.exe', '.sh', '.bat', '.cmd', '.com', '.msi', '.vbs', '.ps1'])(
    'rejects unsafe extension %s',
    async (ext) => {
      const command = new RequestUploadCommand(
        TENANT_ID,
        PLAN_ID,
        TASK_ID,
        ACTOR_ID,
        `malware${ext}`,
        'application/octet-stream',
        1024,
      )

      await expect(handler.execute(command)).rejects.toThrow(UnsafeFileTypeException)
      expect(storageClient.getUploadUrl).not.toHaveBeenCalled()
    },
  )

  it('throws TaskNotFoundException when task does not exist', async () => {
    taskRepo.findById.mockResolvedValue(null)
    const command = new RequestUploadCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      'doc.pdf',
      'application/pdf',
      1024,
    )

    await expect(handler.execute(command)).rejects.toThrow(TaskNotFoundException)
    expect(storageClient.getUploadUrl).not.toHaveBeenCalled()
  })

  it('throws UnauthorizedPlanAccessException when actor lacks edit permission', async () => {
    authSvc.assertCanEditPlan.mockRejectedValue(
      new UnauthorizedPlanAccessException(ACTOR_ID, PLAN_ID),
    )
    const command = new RequestUploadCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      'doc.pdf',
      'application/pdf',
      1024,
    )

    await expect(handler.execute(command)).rejects.toThrow(UnauthorizedPlanAccessException)
    expect(storageClient.getUploadUrl).not.toHaveBeenCalled()
  })
})
