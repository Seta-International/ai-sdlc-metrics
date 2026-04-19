import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { FinalizeEvidenceUploadHandler } from './finalize-upload.handler'
import { FinalizeEvidenceUploadCommand } from './finalize-upload.command'
import { Task } from '../../../domain/entities/task.entity'
import { TaskEvidence } from '../../../domain/entities/task-evidence.entity'
import { EvidenceAddedEvent } from '@future/event-contracts'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { InvalidStorageKeyException } from '../../../domain/exceptions/invalid-storage-key.exception'
import { StorageKeyNotFoundException } from '../../../domain/exceptions/storage-key-not-found.exception'
import { CaptionRequiredException } from '../../../domain/exceptions/caption-required.exception'
import type { ITaskRepository } from '../../../domain/repositories/task.repository'
import type { ITaskEvidenceRepository } from '../../../domain/repositories/task-evidence.repository'
import type { StorageClient } from '@future/storage'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const TASK_ID = 'task-1'
const ACTOR_ID = 'actor-1'
const EVIDENCE_ID = 'evidence-1'
const VALID_KEY = `${TENANT_ID}/documents/planner-evidence/${TASK_ID}/uuid.pdf`

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

describe('FinalizeEvidenceUploadHandler', () => {
  let handler: FinalizeEvidenceUploadHandler
  let taskRepo: { findById: ReturnType<typeof vi.fn> }
  let evidenceRepo: { add: ReturnType<typeof vi.fn> }
  let storageClient: { headObject: ReturnType<typeof vi.fn> }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    taskRepo = { findById: vi.fn().mockResolvedValue(makeTask()) }
    evidenceRepo = { add: vi.fn().mockResolvedValue(undefined) }
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
    handler = new FinalizeEvidenceUploadHandler(
      taskRepo as unknown as ITaskRepository,
      evidenceRepo as unknown as ITaskEvidenceRepository,
      storageClient as unknown as StorageClient,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('creates evidence row and emits EvidenceAddedEvent', async () => {
    const command = new FinalizeEvidenceUploadCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      EVIDENCE_ID,
      ACTOR_ID,
      VALID_KEY,
      'document.pdf',
      'application/pdf',
      1024,
      'Proof of work',
    )

    await handler.execute(command)

    expect(authSvc.assertCanEditPlan).toHaveBeenCalledWith(ACTOR_ID, PLAN_ID, TENANT_ID)
    expect(storageClient.headObject).toHaveBeenCalledWith(VALID_KEY)
    expect(evidenceRepo.add).toHaveBeenCalledOnce()
    const saved: TaskEvidence = evidenceRepo.add.mock.calls[0][0]
    expect(saved.id).toBe(EVIDENCE_ID)
    expect(saved.taskId).toBe(TASK_ID)
    expect(saved.kind).toBe('file')
    expect(saved.storageKey).toBe(VALID_KEY)
    expect(saved.caption).toBe('Proof of work')
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(EvidenceAddedEvent))
    const event: EvidenceAddedEvent = eventBus.publish.mock.calls[0][0]
    expect(event.evidenceId).toBe(EVIDENCE_ID)
    expect(event.kind).toBe('file')
  })

  it('throws CaptionRequiredException when caption is empty', async () => {
    const command = new FinalizeEvidenceUploadCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      EVIDENCE_ID,
      ACTOR_ID,
      VALID_KEY,
      'document.pdf',
      'application/pdf',
      1024,
      '',
    )

    await expect(handler.execute(command)).rejects.toThrow(CaptionRequiredException)
    expect(evidenceRepo.add).not.toHaveBeenCalled()
  })

  it('throws when storageKey does not start with expected prefix', async () => {
    const command = new FinalizeEvidenceUploadCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      EVIDENCE_ID,
      ACTOR_ID,
      'other-tenant/documents/planner-evidence/other-task/uuid.pdf',
      'document.pdf',
      'application/pdf',
      1024,
      'Caption',
    )

    await expect(handler.execute(command)).rejects.toThrow(InvalidStorageKeyException)
    expect(storageClient.headObject).not.toHaveBeenCalled()
    expect(evidenceRepo.add).not.toHaveBeenCalled()
  })

  it('throws when headObject returns null (key not in S3)', async () => {
    storageClient.headObject.mockResolvedValue(null)
    const command = new FinalizeEvidenceUploadCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      EVIDENCE_ID,
      ACTOR_ID,
      VALID_KEY,
      'document.pdf',
      'application/pdf',
      1024,
      'Caption',
    )

    await expect(handler.execute(command)).rejects.toThrow(StorageKeyNotFoundException)
    expect(evidenceRepo.add).not.toHaveBeenCalled()
  })

  it('throws TaskNotFoundException when task does not exist', async () => {
    taskRepo.findById.mockResolvedValue(null)
    const command = new FinalizeEvidenceUploadCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      EVIDENCE_ID,
      ACTOR_ID,
      VALID_KEY,
      'doc.pdf',
      'application/pdf',
      1024,
      'Caption',
    )

    await expect(handler.execute(command)).rejects.toThrow(TaskNotFoundException)
    expect(evidenceRepo.add).not.toHaveBeenCalled()
  })

  it('throws UnauthorizedPlanAccessException when actor lacks edit permission', async () => {
    authSvc.assertCanEditPlan.mockRejectedValue(
      new UnauthorizedPlanAccessException(ACTOR_ID, PLAN_ID),
    )
    const command = new FinalizeEvidenceUploadCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      EVIDENCE_ID,
      ACTOR_ID,
      VALID_KEY,
      'doc.pdf',
      'application/pdf',
      1024,
      'Caption',
    )

    await expect(handler.execute(command)).rejects.toThrow(UnauthorizedPlanAccessException)
    expect(evidenceRepo.add).not.toHaveBeenCalled()
    expect(eventBus.publish).not.toHaveBeenCalled()
  })
})
