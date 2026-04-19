import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { CreateEvidenceLinkHandler } from './create-link.handler'
import { CreateEvidenceLinkCommand } from './create-link.command'
import { Task } from '../../../domain/entities/task.entity'
import { TaskEvidence } from '../../../domain/entities/task-evidence.entity'
import { EvidenceAddedEvent } from '@future/event-contracts'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { InvalidAttachmentUrlException } from '../../../domain/exceptions/invalid-attachment-url.exception'
import { CaptionRequiredException } from '../../../domain/exceptions/caption-required.exception'
import type { ITaskRepository } from '../../../domain/repositories/task.repository'
import type { ITaskEvidenceRepository } from '../../../domain/repositories/task-evidence.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const TASK_ID = 'task-1'
const ACTOR_ID = 'actor-1'
const EVIDENCE_ID = 'evidence-1'

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

describe('CreateEvidenceLinkHandler', () => {
  let handler: CreateEvidenceLinkHandler
  let taskRepo: { findById: ReturnType<typeof vi.fn> }
  let evidenceRepo: { add: ReturnType<typeof vi.fn> }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    taskRepo = { findById: vi.fn().mockResolvedValue(makeTask()) }
    evidenceRepo = { add: vi.fn().mockResolvedValue(undefined) }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new CreateEvidenceLinkHandler(
      taskRepo as unknown as ITaskRepository,
      evidenceRepo as unknown as ITaskEvidenceRepository,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('creates link evidence and emits EvidenceAddedEvent', async () => {
    const command = new CreateEvidenceLinkCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      EVIDENCE_ID,
      ACTOR_ID,
      'https://example.com',
      'External reference',
      'Example Site',
    )

    await handler.execute(command)

    expect(authSvc.assertCanEditPlan).toHaveBeenCalledWith(ACTOR_ID, PLAN_ID, TENANT_ID)
    expect(evidenceRepo.add).toHaveBeenCalledOnce()
    const saved: TaskEvidence = evidenceRepo.add.mock.calls[0][0]
    expect(saved.kind).toBe('link')
    expect(saved.url).toBe('https://example.com')
    expect(saved.caption).toBe('External reference')
    expect(saved.linkTitle).toBe('Example Site')
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(EvidenceAddedEvent))
    const event: EvidenceAddedEvent = eventBus.publish.mock.calls[0][0]
    expect(event.kind).toBe('link')
    expect(event.evidenceId).toBe(EVIDENCE_ID)
  })

  it('creates link evidence without optional linkTitle', async () => {
    const command = new CreateEvidenceLinkCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      EVIDENCE_ID,
      ACTOR_ID,
      'https://example.com',
      'Reference',
      undefined,
    )

    await handler.execute(command)

    const saved: TaskEvidence = evidenceRepo.add.mock.calls[0][0]
    expect(saved.linkTitle).toBeUndefined()
  })

  it('throws InvalidAttachmentUrlException for non-http/https URL', async () => {
    const command = new CreateEvidenceLinkCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      EVIDENCE_ID,
      ACTOR_ID,
      'ftp://example.com',
      'Caption',
      undefined,
    )

    await expect(handler.execute(command)).rejects.toThrow(InvalidAttachmentUrlException)
    expect(evidenceRepo.add).not.toHaveBeenCalled()
  })

  it('throws InvalidAttachmentUrlException for malformed URL', async () => {
    const command = new CreateEvidenceLinkCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      EVIDENCE_ID,
      ACTOR_ID,
      'not-a-url',
      'Caption',
      undefined,
    )

    await expect(handler.execute(command)).rejects.toThrow(InvalidAttachmentUrlException)
    expect(evidenceRepo.add).not.toHaveBeenCalled()
  })

  it('throws CaptionRequiredException when caption is empty', async () => {
    const command = new CreateEvidenceLinkCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      EVIDENCE_ID,
      ACTOR_ID,
      'https://example.com',
      '',
      undefined,
    )

    await expect(handler.execute(command)).rejects.toThrow(CaptionRequiredException)
    expect(evidenceRepo.add).not.toHaveBeenCalled()
  })

  it('throws TaskNotFoundException when task does not exist', async () => {
    taskRepo.findById.mockResolvedValue(null)
    const command = new CreateEvidenceLinkCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      EVIDENCE_ID,
      ACTOR_ID,
      'https://example.com',
      'Caption',
      undefined,
    )

    await expect(handler.execute(command)).rejects.toThrow(TaskNotFoundException)
    expect(evidenceRepo.add).not.toHaveBeenCalled()
  })

  it('throws UnauthorizedPlanAccessException when actor lacks edit permission', async () => {
    authSvc.assertCanEditPlan.mockRejectedValue(
      new UnauthorizedPlanAccessException(ACTOR_ID, PLAN_ID),
    )
    const command = new CreateEvidenceLinkCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      EVIDENCE_ID,
      ACTOR_ID,
      'https://example.com',
      'Caption',
      undefined,
    )

    await expect(handler.execute(command)).rejects.toThrow(UnauthorizedPlanAccessException)
    expect(evidenceRepo.add).not.toHaveBeenCalled()
    expect(eventBus.publish).not.toHaveBeenCalled()
  })
})
