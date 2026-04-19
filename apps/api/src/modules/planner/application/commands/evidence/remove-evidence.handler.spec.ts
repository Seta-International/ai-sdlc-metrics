import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { RemoveEvidenceHandler } from './remove-evidence.handler'
import { RemoveEvidenceCommand } from './remove-evidence.command'
import { Task } from '../../../domain/entities/task.entity'
import { TaskEvidence } from '../../../domain/entities/task-evidence.entity'
import { EvidenceRemovedEvent } from '@future/event-contracts'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { EvidenceNotFoundException } from '../../../domain/exceptions/evidence-not-found.exception'
import type { ITaskRepository } from '../../../domain/repositories/task.repository'
import type { ITaskEvidenceRepository } from '../../../domain/repositories/task-evidence.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const TASK_ID = 'task-1'
const ACTOR_ID = 'actor-1'
const OTHER_ACTOR_ID = 'actor-2'
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

function makeEvidence(submittedBy = ACTOR_ID): TaskEvidence {
  return TaskEvidence.createNote({
    id: EVIDENCE_ID,
    taskId: TASK_ID,
    tenantId: TENANT_ID,
    submittedBy,
    caption: 'Test note',
    body: 'Note body',
  })
}

describe('RemoveEvidenceHandler', () => {
  let handler: RemoveEvidenceHandler
  let taskRepo: { findById: ReturnType<typeof vi.fn> }
  let evidenceRepo: {
    findById: ReturnType<typeof vi.fn>
    remove: ReturnType<typeof vi.fn>
  }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    taskRepo = { findById: vi.fn().mockResolvedValue(makeTask()) }
    evidenceRepo = {
      findById: vi.fn().mockResolvedValue(makeEvidence()),
      remove: vi.fn().mockResolvedValue(undefined),
    }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new RemoveEvidenceHandler(
      taskRepo as unknown as ITaskRepository,
      evidenceRepo as unknown as ITaskEvidenceRepository,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('removes evidence by submitter without assertCanEditPlan check', async () => {
    const command = new RemoveEvidenceCommand(TENANT_ID, PLAN_ID, TASK_ID, EVIDENCE_ID, ACTOR_ID)

    await handler.execute(command)

    expect(evidenceRepo.remove).toHaveBeenCalledWith(EVIDENCE_ID, TENANT_ID)
    expect(authSvc.assertCanEditPlan).not.toHaveBeenCalled()
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(EvidenceRemovedEvent))
    const event: EvidenceRemovedEvent = eventBus.publish.mock.calls[0][0]
    expect(event.evidenceId).toBe(EVIDENCE_ID)
    expect(event.storageKey).toBeNull()
  })

  it('removes evidence by editor (non-submitter) after assertCanEditPlan succeeds', async () => {
    evidenceRepo.findById.mockResolvedValue(makeEvidence(ACTOR_ID))
    const command = new RemoveEvidenceCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      EVIDENCE_ID,
      OTHER_ACTOR_ID,
    )

    await handler.execute(command)

    expect(authSvc.assertCanEditPlan).toHaveBeenCalledWith(OTHER_ACTOR_ID, PLAN_ID, TENANT_ID)
    expect(evidenceRepo.remove).toHaveBeenCalledWith(EVIDENCE_ID, TENANT_ID)
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(EvidenceRemovedEvent))
  })

  it('emits EvidenceRemovedEvent with storageKey for file evidence', async () => {
    const fileEvidence = TaskEvidence.createFile({
      id: EVIDENCE_ID,
      taskId: TASK_ID,
      tenantId: TENANT_ID,
      submittedBy: ACTOR_ID,
      caption: 'File proof',
      storageKey: `${TENANT_ID}/documents/planner-evidence/${TASK_ID}/file.pdf`,
      filename: 'file.pdf',
      contentType: 'application/pdf',
      sizeBytes: 1024,
    })
    evidenceRepo.findById.mockResolvedValue(fileEvidence)

    const command = new RemoveEvidenceCommand(TENANT_ID, PLAN_ID, TASK_ID, EVIDENCE_ID, ACTOR_ID)
    await handler.execute(command)

    const event: EvidenceRemovedEvent = eventBus.publish.mock.calls[0][0]
    expect(event.storageKey).toBe(`${TENANT_ID}/documents/planner-evidence/${TASK_ID}/file.pdf`)
  })

  it('throws UnauthorizedPlanAccessException when non-submitter lacks edit permission', async () => {
    authSvc.assertCanEditPlan.mockRejectedValue(
      new UnauthorizedPlanAccessException(OTHER_ACTOR_ID, PLAN_ID),
    )
    evidenceRepo.findById.mockResolvedValue(makeEvidence(ACTOR_ID))
    const command = new RemoveEvidenceCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      EVIDENCE_ID,
      OTHER_ACTOR_ID,
    )

    await expect(handler.execute(command)).rejects.toThrow(UnauthorizedPlanAccessException)
    expect(evidenceRepo.remove).not.toHaveBeenCalled()
    expect(eventBus.publish).not.toHaveBeenCalled()
  })

  it('throws EvidenceNotFoundException when evidence does not exist', async () => {
    evidenceRepo.findById.mockResolvedValue(null)
    const command = new RemoveEvidenceCommand(TENANT_ID, PLAN_ID, TASK_ID, EVIDENCE_ID, ACTOR_ID)

    await expect(handler.execute(command)).rejects.toThrow(EvidenceNotFoundException)
    expect(evidenceRepo.remove).not.toHaveBeenCalled()
  })

  it('throws EvidenceNotFoundException when evidence belongs to different task', async () => {
    const evidenceForOtherTask = TaskEvidence.createNote({
      id: EVIDENCE_ID,
      taskId: 'other-task',
      tenantId: TENANT_ID,
      submittedBy: ACTOR_ID,
      caption: 'Note',
      body: 'Body',
    })
    evidenceRepo.findById.mockResolvedValue(evidenceForOtherTask)
    const command = new RemoveEvidenceCommand(TENANT_ID, PLAN_ID, TASK_ID, EVIDENCE_ID, ACTOR_ID)

    await expect(handler.execute(command)).rejects.toThrow(EvidenceNotFoundException)
    expect(evidenceRepo.remove).not.toHaveBeenCalled()
  })

  it('throws TaskNotFoundException when task does not exist', async () => {
    taskRepo.findById.mockResolvedValue(null)
    const command = new RemoveEvidenceCommand(TENANT_ID, PLAN_ID, TASK_ID, EVIDENCE_ID, ACTOR_ID)

    await expect(handler.execute(command)).rejects.toThrow(TaskNotFoundException)
    expect(evidenceRepo.remove).not.toHaveBeenCalled()
  })
})
