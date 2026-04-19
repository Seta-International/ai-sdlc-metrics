import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SetCoverHandler } from './set-cover.handler'
import { SetCoverCommand } from './set-cover.command'
import { Task } from '../../../domain/entities/task.entity'
import { TaskAttachment } from '../../../domain/entities/task-attachment.entity'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { AttachmentNotFoundException } from '../../../domain/exceptions/attachment-not-found.exception'
import { ConcurrentModificationException } from '../../../domain/exceptions/concurrent-modification.exception'
import type { ITaskRepository } from '../../../domain/repositories/task.repository'
import type { ITaskAttachmentRepository } from '../../../domain/repositories/task-attachment.repository'
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

function makeAttachment(taskId = TASK_ID): TaskAttachment {
  return TaskAttachment.createFile({
    id: ATTACHMENT_ID,
    taskId,
    tenantId: TENANT_ID,
    createdBy: ACTOR_ID,
    storageKey: `${TENANT_ID}/documents/planner/${taskId}/uuid.jpg`,
    filename: 'photo.jpg',
    contentType: 'image/jpeg',
    sizeBytes: 1024,
  })
}

describe('SetCoverHandler', () => {
  let handler: SetCoverHandler
  let taskRepo: { findById: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  let attachmentRepo: { findById: ReturnType<typeof vi.fn> }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    taskRepo = {
      findById: vi.fn().mockResolvedValue(makeTask()),
      update: vi.fn().mockResolvedValue(undefined),
    }
    attachmentRepo = { findById: vi.fn().mockResolvedValue(makeAttachment()) }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    handler = new SetCoverHandler(
      taskRepo as unknown as ITaskRepository,
      attachmentRepo as unknown as ITaskAttachmentRepository,
      authSvc as unknown as PlanAuthorizationService,
    )
  })

  it('sets cover attachment on task', async () => {
    const task = makeTask()
    taskRepo.findById.mockResolvedValue(task)
    const expectedVersion = task.updatedAt.toISOString()
    const command = new SetCoverCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      expectedVersion,
      ATTACHMENT_ID,
    )

    await handler.execute(command)

    expect(authSvc.assertCanEditPlan).toHaveBeenCalledWith(ACTOR_ID, PLAN_ID, TENANT_ID)
    expect(attachmentRepo.findById).toHaveBeenCalledWith(ATTACHMENT_ID, TENANT_ID)
    expect(taskRepo.update).toHaveBeenCalledOnce()
    const [updatedTask, version] = taskRepo.update.mock.calls[0]
    expect(updatedTask.coverAttachmentId).toBe(ATTACHMENT_ID)
    expect(version).toBe(expectedVersion)
  })

  it('clears cover when attachmentId is undefined', async () => {
    const task = makeTask()
    taskRepo.findById.mockResolvedValue(task)
    const expectedVersion = task.updatedAt.toISOString()
    const command = new SetCoverCommand(TENANT_ID, PLAN_ID, TASK_ID, ACTOR_ID, expectedVersion)

    await handler.execute(command)

    expect(attachmentRepo.findById).not.toHaveBeenCalled()
    expect(taskRepo.update).toHaveBeenCalledOnce()
    const [updatedTask] = taskRepo.update.mock.calls[0]
    expect(updatedTask.coverAttachmentId).toBeNull()
  })

  it('throws AttachmentNotFoundException when attachment does not exist', async () => {
    attachmentRepo.findById.mockResolvedValue(null)
    const task = makeTask()
    const command = new SetCoverCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      task.updatedAt.toISOString(),
      ATTACHMENT_ID,
    )

    await expect(handler.execute(command)).rejects.toThrow(AttachmentNotFoundException)
    expect(taskRepo.update).not.toHaveBeenCalled()
  })

  it('throws AttachmentNotFoundException when attachment belongs to a different task', async () => {
    attachmentRepo.findById.mockResolvedValue(makeAttachment('other-task'))
    const task = makeTask()
    const command = new SetCoverCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      task.updatedAt.toISOString(),
      ATTACHMENT_ID,
    )

    await expect(handler.execute(command)).rejects.toThrow(AttachmentNotFoundException)
    expect(taskRepo.update).not.toHaveBeenCalled()
  })

  it('throws ConcurrentModificationException when task version has changed', async () => {
    const task = makeTask()
    taskRepo.findById.mockResolvedValue(task)
    taskRepo.update.mockRejectedValue(new ConcurrentModificationException())
    const command = new SetCoverCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      'stale-version',
      ATTACHMENT_ID,
    )

    await expect(handler.execute(command)).rejects.toThrow(ConcurrentModificationException)
  })

  it('throws TaskNotFoundException when task does not exist', async () => {
    taskRepo.findById.mockResolvedValue(null)
    const command = new SetCoverCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      'version',
      ATTACHMENT_ID,
    )

    await expect(handler.execute(command)).rejects.toThrow(TaskNotFoundException)
    expect(taskRepo.update).not.toHaveBeenCalled()
  })

  it('throws UnauthorizedPlanAccessException when actor lacks edit permission', async () => {
    authSvc.assertCanEditPlan.mockRejectedValue(
      new UnauthorizedPlanAccessException(ACTOR_ID, PLAN_ID),
    )
    const command = new SetCoverCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ACTOR_ID,
      'version',
      ATTACHMENT_ID,
    )

    await expect(handler.execute(command)).rejects.toThrow(UnauthorizedPlanAccessException)
    expect(taskRepo.update).not.toHaveBeenCalled()
  })
})
