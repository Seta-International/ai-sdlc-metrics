import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { FinalizeUploadHandler } from './finalize-upload.handler'
import { FinalizeUploadCommand } from './finalize-upload.command'
import { Task } from '../../../domain/entities/task.entity'
import { TaskAttachment } from '../../../domain/entities/task-attachment.entity'
import { AttachmentAddedEvent } from '@future/event-contracts'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { InvalidStorageKeyException } from '../../../domain/exceptions/invalid-storage-key.exception'
import { StorageKeyNotFoundException } from '../../../domain/exceptions/storage-key-not-found.exception'
import type { ITaskRepository } from '../../../domain/repositories/task.repository'
import type { ITaskAttachmentRepository } from '../../../domain/repositories/task-attachment.repository'
import type { StorageClient } from '@future/storage'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const TASK_ID = 'task-1'
const ACTOR_ID = 'actor-1'
const ATTACHMENT_ID = 'attachment-1'
const VALID_KEY = `${TENANT_ID}/documents/planner/${TASK_ID}/uuid.pdf`

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

describe('FinalizeUploadHandler', () => {
  let handler: FinalizeUploadHandler
  let taskRepo: { findById: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  let attachmentRepo: { add: ReturnType<typeof vi.fn> }
  let storageClient: { headObject: ReturnType<typeof vi.fn> }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    taskRepo = {
      findById: vi.fn().mockResolvedValue(makeTask()),
      update: vi.fn().mockResolvedValue(undefined),
    }
    attachmentRepo = { add: vi.fn().mockResolvedValue(undefined) }
    storageClient = {
      headObject: vi.fn().mockResolvedValue({
        key: VALID_KEY,
        size: 1024,
        contentType: 'application/pdf',
        lastModified: new Date(),
      }),
    }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new FinalizeUploadHandler(
      taskRepo as unknown as ITaskRepository,
      attachmentRepo as unknown as ITaskAttachmentRepository,
      storageClient as unknown as StorageClient,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('creates attachment row and emits AttachmentAddedEvent', async () => {
    const command = new FinalizeUploadCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ATTACHMENT_ID,
      ACTOR_ID,
      VALID_KEY,
      'document.pdf',
      'application/pdf',
      1024,
    )

    await handler.execute(command)

    expect(authSvc.assertCanEditPlan).toHaveBeenCalledWith(ACTOR_ID, PLAN_ID, TENANT_ID)
    expect(storageClient.headObject).toHaveBeenCalledWith(VALID_KEY)
    expect(attachmentRepo.add).toHaveBeenCalledOnce()
    const saved: TaskAttachment = attachmentRepo.add.mock.calls[0][0]
    expect(saved.id).toBe(ATTACHMENT_ID)
    expect(saved.taskId).toBe(TASK_ID)
    expect(saved.kind).toBe('file')
    expect(saved.storageKey).toBe(VALID_KEY)
    expect(taskRepo.update).not.toHaveBeenCalled()
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(AttachmentAddedEvent))
    const event: AttachmentAddedEvent = eventBus.publish.mock.calls[0][0]
    expect(event.attachmentId).toBe(ATTACHMENT_ID)
    expect(event.kind).toBe('file')
  })

  it('sets task cover when setAsCover=true and contentType is image', async () => {
    const task = makeTask()
    taskRepo.findById.mockResolvedValue(task)
    const callOrder: string[] = []
    taskRepo.update.mockImplementation(async () => {
      callOrder.push('taskRepo.update')
    })
    attachmentRepo.add.mockImplementation(async () => {
      callOrder.push('attachmentRepo.add')
    })
    const command = new FinalizeUploadCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ATTACHMENT_ID,
      ACTOR_ID,
      VALID_KEY,
      'photo.jpg',
      'image/jpeg',
      2048,
      true, // setAsCover
    )

    await handler.execute(command)

    expect(taskRepo.update).toHaveBeenCalledOnce()
    const [updatedTask] = taskRepo.update.mock.calls[0]
    expect(updatedTask.coverAttachmentId).toBe(ATTACHMENT_ID)
    // Cover update must happen before attachment row is created (fail-fast ordering)
    expect(callOrder).toEqual(['taskRepo.update', 'attachmentRepo.add'])
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(AttachmentAddedEvent))
  })

  it('does NOT set cover when setAsCover=true but contentType is not image', async () => {
    const command = new FinalizeUploadCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ATTACHMENT_ID,
      ACTOR_ID,
      VALID_KEY,
      'document.pdf',
      'application/pdf',
      1024,
      true, // setAsCover but not an image
    )

    await handler.execute(command)

    expect(taskRepo.update).not.toHaveBeenCalled()
  })

  it('throws when storageKey does not start with expected prefix', async () => {
    const command = new FinalizeUploadCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ATTACHMENT_ID,
      ACTOR_ID,
      'other-tenant/documents/planner/other-task/uuid.pdf',
      'document.pdf',
      'application/pdf',
      1024,
    )

    await expect(handler.execute(command)).rejects.toThrow(InvalidStorageKeyException)
    expect(storageClient.headObject).not.toHaveBeenCalled()
    expect(attachmentRepo.add).not.toHaveBeenCalled()
  })

  it('throws when headObject returns null (key not in S3)', async () => {
    storageClient.headObject.mockResolvedValue(null)
    const command = new FinalizeUploadCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ATTACHMENT_ID,
      ACTOR_ID,
      VALID_KEY,
      'document.pdf',
      'application/pdf',
      1024,
    )

    await expect(handler.execute(command)).rejects.toThrow(StorageKeyNotFoundException)
    expect(attachmentRepo.add).not.toHaveBeenCalled()
  })

  it('throws TaskNotFoundException when task does not exist', async () => {
    taskRepo.findById.mockResolvedValue(null)
    const command = new FinalizeUploadCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ATTACHMENT_ID,
      ACTOR_ID,
      VALID_KEY,
      'doc.pdf',
      'application/pdf',
      1024,
    )

    await expect(handler.execute(command)).rejects.toThrow(TaskNotFoundException)
    expect(attachmentRepo.add).not.toHaveBeenCalled()
  })

  it('throws UnauthorizedPlanAccessException when actor lacks edit permission', async () => {
    authSvc.assertCanEditPlan.mockRejectedValue(
      new UnauthorizedPlanAccessException(ACTOR_ID, PLAN_ID),
    )
    const command = new FinalizeUploadCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ATTACHMENT_ID,
      ACTOR_ID,
      VALID_KEY,
      'doc.pdf',
      'application/pdf',
      1024,
    )

    await expect(handler.execute(command)).rejects.toThrow(UnauthorizedPlanAccessException)
    expect(attachmentRepo.add).not.toHaveBeenCalled()
    expect(eventBus.publish).not.toHaveBeenCalled()
  })
})
