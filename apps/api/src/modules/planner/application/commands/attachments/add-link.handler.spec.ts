import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { AddLinkHandler } from './add-link.handler'
import { AddLinkCommand } from './add-link.command'
import { Task } from '../../../domain/entities/task.entity'
import { TaskAttachment } from '../../../domain/entities/task-attachment.entity'
import { AttachmentAddedEvent } from '@future/event-contracts'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
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

describe('AddLinkHandler', () => {
  let handler: AddLinkHandler
  let taskRepo: { findById: ReturnType<typeof vi.fn> }
  let attachmentRepo: { add: ReturnType<typeof vi.fn> }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    taskRepo = { findById: vi.fn().mockResolvedValue(makeTask()) }
    attachmentRepo = { add: vi.fn().mockResolvedValue(undefined) }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new AddLinkHandler(
      taskRepo as unknown as ITaskRepository,
      attachmentRepo as unknown as ITaskAttachmentRepository,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('creates link attachment and emits AttachmentAddedEvent', async () => {
    const command = new AddLinkCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ATTACHMENT_ID,
      ACTOR_ID,
      'https://example.com/doc',
      'Useful Link',
    )

    await handler.execute(command)

    expect(authSvc.assertCanEditPlan).toHaveBeenCalledWith(ACTOR_ID, PLAN_ID, TENANT_ID)
    expect(attachmentRepo.add).toHaveBeenCalledOnce()
    const saved: TaskAttachment = attachmentRepo.add.mock.calls[0][0]
    expect(saved.id).toBe(ATTACHMENT_ID)
    expect(saved.taskId).toBe(TASK_ID)
    expect(saved.kind).toBe('link')
    expect(saved.url).toBe('https://example.com/doc')
    expect(saved.linkTitle).toBe('Useful Link')
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(AttachmentAddedEvent))
    const event: AttachmentAddedEvent = eventBus.publish.mock.calls[0][0]
    expect(event.attachmentId).toBe(ATTACHMENT_ID)
    expect(event.kind).toBe('link')
  })

  it('accepts http URLs', async () => {
    const command = new AddLinkCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ATTACHMENT_ID,
      ACTOR_ID,
      'http://intranet.example.com/page',
    )

    await handler.execute(command)

    expect(attachmentRepo.add).toHaveBeenCalledOnce()
  })

  it('throws for invalid URL', async () => {
    const command = new AddLinkCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ATTACHMENT_ID,
      ACTOR_ID,
      'not-a-url',
    )

    await expect(handler.execute(command)).rejects.toThrow('Invalid URL')
    expect(attachmentRepo.add).not.toHaveBeenCalled()
    expect(eventBus.publish).not.toHaveBeenCalled()
  })

  it('throws for non-http/https URL', async () => {
    const command = new AddLinkCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ATTACHMENT_ID,
      ACTOR_ID,
      'ftp://files.example.com/doc',
    )

    await expect(handler.execute(command)).rejects.toThrow('http or https')
    expect(attachmentRepo.add).not.toHaveBeenCalled()
  })

  it('throws TaskNotFoundException when task does not exist', async () => {
    taskRepo.findById.mockResolvedValue(null)
    const command = new AddLinkCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ATTACHMENT_ID,
      ACTOR_ID,
      'https://example.com',
    )

    await expect(handler.execute(command)).rejects.toThrow(TaskNotFoundException)
    expect(attachmentRepo.add).not.toHaveBeenCalled()
  })

  it('throws UnauthorizedPlanAccessException when actor lacks edit permission', async () => {
    authSvc.assertCanEditPlan.mockRejectedValue(
      new UnauthorizedPlanAccessException(ACTOR_ID, PLAN_ID),
    )
    const command = new AddLinkCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      ATTACHMENT_ID,
      ACTOR_ID,
      'https://example.com',
    )

    await expect(handler.execute(command)).rejects.toThrow(UnauthorizedPlanAccessException)
    expect(attachmentRepo.add).not.toHaveBeenCalled()
    expect(eventBus.publish).not.toHaveBeenCalled()
  })
})
