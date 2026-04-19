import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { EvidenceAddedEvent } from '@future/event-contracts'
import { TASK_REPOSITORY, type ITaskRepository } from '../../../domain/repositories/task.repository'
import {
  TASK_EVIDENCE_REPOSITORY,
  type ITaskEvidenceRepository,
} from '../../../domain/repositories/task-evidence.repository'
import { TaskEvidence } from '../../../domain/entities/task-evidence.entity'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { InvalidStorageKeyException } from '../../../domain/exceptions/invalid-storage-key.exception'
import { StorageKeyNotFoundException } from '../../../domain/exceptions/storage-key-not-found.exception'
import { STORAGE_CLIENT, type StorageClient } from '../../../domain/ports/storage-client.port'
import { buildEvidenceKeyPrefix } from './evidence-key'
import { FinalizeEvidenceUploadCommand } from './finalize-upload.command'

@CommandHandler(FinalizeEvidenceUploadCommand)
export class FinalizeEvidenceUploadHandler implements ICommandHandler<FinalizeEvidenceUploadCommand> {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
    @Inject(TASK_EVIDENCE_REPOSITORY)
    private readonly evidenceRepo: ITaskEvidenceRepository,
    @Inject(STORAGE_CLIENT) private readonly storageClient: StorageClient,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: FinalizeEvidenceUploadCommand): Promise<void> {
    await this.authSvc.assertCanEditPlan(command.actorId, command.planId, command.tenantId)

    const task = await this.taskRepo.findById(command.taskId, command.tenantId)
    if (!task) throw new TaskNotFoundException(command.taskId)

    const expectedPrefix = buildEvidenceKeyPrefix(command.tenantId, command.taskId)
    if (!command.storageKey.startsWith(expectedPrefix)) {
      throw new InvalidStorageKeyException(command.storageKey)
    }

    const meta = await this.storageClient.headObject(command.storageKey)
    if (!meta) {
      throw new StorageKeyNotFoundException(command.storageKey)
    }

    const evidence = TaskEvidence.createFile({
      id: command.evidenceId,
      taskId: command.taskId,
      tenantId: command.tenantId,
      submittedBy: command.actorId,
      caption: command.caption,
      storageKey: command.storageKey,
      filename: command.filename,
      contentType: command.contentType,
      sizeBytes: command.sizeBytes,
    })

    await this.evidenceRepo.add(evidence)

    await this.eventBus.publish(
      new EvidenceAddedEvent(
        command.tenantId,
        command.actorId,
        command.taskId,
        command.evidenceId,
        'file',
      ),
    )
  }
}
