import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { RemoveAttachmentHandler } from './remove.handler'
import { RemoveAttachmentCommand } from './remove.command'
import { SetCoverHandler } from './set-cover.handler'
import { SetCoverCommand } from './set-cover.command'
import { Task } from '../../../domain/entities/task.entity'
import { TaskAttachment } from '../../../domain/entities/task-attachment.entity'
import { AttachmentRemovedEvent } from '@future/event-contracts'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { AttachmentNotFoundException } from '../../../domain/exceptions/attachment-not-found.exception'
import type { ITaskRepository } from '../../../domain/repositories/task.repository'
import type { ITaskAttachmentRepository } from '../../../domain/repositories/task-attachment.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const TASK_ID = 'task-1'
const ACTOR_ID = 'actor-1'
const ATTACHMENT_ID = 'attachment-1'
const STORAGE_KEY = `${TENANT_ID}/documents/planner/${TASK_ID}/uuid.pdf`

function makeTask(coverAttachmentId: string | null = null): Task {
  const task = Task.create({
    id: TASK_ID,
    tenantId: TENANT_ID,
    planId: PLAN_ID,
    bucketId: 'bucket-1',
    title: 'Task',
    orderHint: ' !',
    createdBy: ACTOR_ID,
  })
  if (coverAttachmentId) {
    task.setCoverAttachment(coverAttachmentId)
  }
  return task
}

function makeFileAttachment(taskId = TASK_ID): TaskAttachment {
  return TaskAttachment.createFile({
    id: ATTACHMENT_ID,
    taskId,
    tenantId: TENANT_ID,
    createdBy: ACTOR_ID,
    storageKey: STORAGE_KEY,
    filename: 'document.pdf',
    contentType: 'application/pdf',
    sizeBytes: 2048,
  })
}

function makeLinkAttachment(): TaskAttachment {
  return TaskAttachment.createLink({
    id: ATTACHMENT_ID,
    taskId: TASK_ID,
    tenantId: TENANT_ID,
    createdBy: ACTOR_ID,
    url: 'https://example.com',
  })
}

describe('RemoveAttachmentHandler', () => {
  let handler: RemoveAttachmentHandler
  let taskRepo: { findById: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  let attachmentRepo: {
    findById: ReturnType<typeof vi.fn>
    remove: ReturnType<typeof vi.fn>
  }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    taskRepo = {
      findById: vi.fn().mockResolvedValue(makeTask()),
      update: vi.fn().mockResolvedValue(undefined),
    }
    attachmentRepo = {
      findById: vi.fn().mockResolvedValue(makeFileAttachment()),
      remove: vi.fn().mockResolvedValue(undefined),
    }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new RemoveAttachmentHandler(
      taskRepo as unknown as ITaskRepository,
      attachmentRepo as unknown as ITaskAttachmentRepository,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('removes file attachment and emits AttachmentRemovedEvent with storageKey', async () => {
    const task = makeTask()
    taskRepo.findById.mockResolvedValue(task)
    const expectedVersion = task.updatedAt.toISOString()
    const command = new RemoveAttachmentCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ATTACHMENT_ID,
      ACTOR_ID,
      expectedVersion,
    )

    await handler.execute(command)

    expect(authSvc.assertCanEditPlan).toHaveBeenCalledWith(ACTOR_ID, PLAN_ID, TENANT_ID)
    expect(attachmentRepo.remove).toHaveBeenCalledWith(ATTACHMENT_ID, TENANT_ID)
    expect(taskRepo.update).not.toHaveBeenCalled() // not a cover
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(AttachmentRemovedEvent))
    const event: AttachmentRemovedEvent = eventBus.publish.mock.calls[0][0]
    expect(event.attachmentId).toBe(ATTACHMENT_ID)
    expect(event.storageKey).toBe(STORAGE_KEY)
  })

  it('clears cover before removing if attachment is the task cover', async () => {
    const task = makeTask(ATTACHMENT_ID)
    taskRepo.findById.mockResolvedValue(task)
    const expectedVersion = task.updatedAt.toISOString()
    const command = new RemoveAttachmentCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ATTACHMENT_ID,
      ACTOR_ID,
      expectedVersion,
    )

    await handler.execute(command)

    expect(taskRepo.update).toHaveBeenCalledOnce()
    const [updatedTask] = taskRepo.update.mock.calls[0]
    expect(updatedTask.coverAttachmentId).toBeNull()
    expect(attachmentRepo.remove).toHaveBeenCalledWith(ATTACHMENT_ID, TENANT_ID)
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(AttachmentRemovedEvent))
  })

  it('emits AttachmentRemovedEvent with storageKey=null for link attachments', async () => {
    attachmentRepo.findById.mockResolvedValue(makeLinkAttachment())
    const task = makeTask()
    taskRepo.findById.mockResolvedValue(task)
    const command = new RemoveAttachmentCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ATTACHMENT_ID,
      ACTOR_ID,
      task.updatedAt.toISOString(),
    )

    await handler.execute(command)

    const event: AttachmentRemovedEvent = eventBus.publish.mock.calls[0][0]
    expect(event.storageKey).toBeNull()
  })

  it('throws AttachmentNotFoundException when attachment does not exist', async () => {
    attachmentRepo.findById.mockResolvedValue(null)
    const task = makeTask()
    const command = new RemoveAttachmentCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ATTACHMENT_ID,
      ACTOR_ID,
      task.updatedAt.toISOString(),
    )

    await expect(handler.execute(command)).rejects.toThrow(AttachmentNotFoundException)
    expect(attachmentRepo.remove).not.toHaveBeenCalled()
  })

  it('throws AttachmentNotFoundException when attachment belongs to a different task', async () => {
    attachmentRepo.findById.mockResolvedValue(makeFileAttachment('other-task'))
    const task = makeTask()
    const command = new RemoveAttachmentCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ATTACHMENT_ID,
      ACTOR_ID,
      task.updatedAt.toISOString(),
    )

    await expect(handler.execute(command)).rejects.toThrow(AttachmentNotFoundException)
    expect(attachmentRepo.remove).not.toHaveBeenCalled()
  })

  it('throws TaskNotFoundException when task does not exist', async () => {
    taskRepo.findById.mockResolvedValue(null)
    const command = new RemoveAttachmentCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ATTACHMENT_ID,
      ACTOR_ID,
      'version',
    )

    await expect(handler.execute(command)).rejects.toThrow(TaskNotFoundException)
    expect(attachmentRepo.remove).not.toHaveBeenCalled()
  })

  it('throws UnauthorizedPlanAccessException when actor lacks edit permission', async () => {
    authSvc.assertCanEditPlan.mockRejectedValue(
      new UnauthorizedPlanAccessException(ACTOR_ID, PLAN_ID),
    )
    const command = new RemoveAttachmentCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ATTACHMENT_ID,
      ACTOR_ID,
      'version',
    )

    await expect(handler.execute(command)).rejects.toThrow(UnauthorizedPlanAccessException)
    expect(attachmentRepo.remove).not.toHaveBeenCalled()
    expect(eventBus.publish).not.toHaveBeenCalled()
  })

  // Cover attachment constraint test:
  // If SetCoverCommand is attempted with an attachmentId that was removed, SetCoverHandler throws AttachmentNotFoundException
  describe('cover constraint after removal', () => {
    it('SetCoverHandler throws AttachmentNotFoundException for a removed attachment', async () => {
      // Simulate removal: after remove, findById returns null
      attachmentRepo.findById.mockResolvedValue(null)

      const setCoverHandler = new SetCoverHandler(
        taskRepo as unknown as ITaskRepository,
        attachmentRepo as unknown as ITaskAttachmentRepository,
        authSvc as unknown as PlanAuthorizationService,
      )

      const task = makeTask()
      taskRepo.findById.mockResolvedValue(task)
      const setCoverCommand = new SetCoverCommand(
        TENANT_ID,
        PLAN_ID,
        TASK_ID,
        ACTOR_ID,
        task.updatedAt.toISOString(),
        ATTACHMENT_ID, // this attachment has been removed
      )

      await expect(setCoverHandler.execute(setCoverCommand)).rejects.toThrow(
        AttachmentNotFoundException,
      )
      expect(taskRepo.update).not.toHaveBeenCalled()
    })
  })
})
